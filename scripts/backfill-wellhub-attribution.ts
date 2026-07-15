// One-time backfill for Wellhub ↔ Magic identity linking.
//
// Two populations neither door reaches on its own:
//   1. Linked BEFORE attribution shipped (2026-07-15) — the link only ever set
//      WellhubUserLink.userId; their Bookings kept userId null. Both link doors
//      return early once a link exists, so these are stuck permanently.
//   2. Never linked, but their email/phone matches an app user today — these
//      would self-heal on their next Wellhub booking; the backfill just doesn't
//      make them wait.
//
// Dry-run by default. Pass --apply to write. The apply path calls the real
// production helpers, so it can't drift from live behaviour.
//
//   npx tsx scripts/backfill-wellhub-attribution.ts            # dry-run
//   npx tsx scripts/backfill-wellhub-attribution.ts --apply
import { prisma } from "@/lib/db";
import {
  attributeWellhubBookingsToUser,
  tryLinkWellhubUserToMagic,
} from "@/lib/platforms/wellhub/matching";

type State =
  | "linked · nothing to do"
  | "linked · bookings to attribute"
  | "unlinked · would link (email)"
  | "unlinked · would link (phone)"
  | "unlinked · no app user"
  | "unlinked · phone ambiguous"
  | "unlinked · no email/phone";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODE: APPLY (writing)\n" : "MODE: dry-run (no writes)\n");

  const links = await prisma.wellhubUserLink.findMany({
    select: {
      id: true, tenantId: true, userId: true, email: true, phone: true,
      fullName: true, wellhubUniqueToken: true, userLinkedAt: true, linkedVia: true,
      tenant: { select: { slug: true } },
    },
  });

  // token → PlatformBooking ids, and which of their Bookings are unattributed.
  const pbs = await prisma.platformBooking.findMany({
    select: { id: true, tenantId: true, wellhubUserUniqueToken: true },
  });
  const byToken = new Map<string, string[]>();
  for (const p of pbs) {
    if (!p.wellhubUserUniqueToken) continue;
    const k = `${p.tenantId}::${p.wellhubUserUniqueToken}`;
    byToken.set(k, [...(byToken.get(k) ?? []), p.id]);
  }
  const orphanBookings = await prisma.booking.findMany({
    where: { userId: null, platformBookingId: { not: null } },
    select: { platformBookingId: true, classId: true },
  });
  const orphanClassByPb = new Map(orphanBookings.map((b) => [b.platformBookingId!, b.classId]));

  // Mirrors attributeWellhubBookingsToUser: skip classes the member already
  // holds a booking for, so the dry-run predicts exactly what --apply writes.
  const pendingCount = async (l: (typeof links)[number]) => {
    const classIds = (byToken.get(`${l.tenantId}::${l.wellhubUniqueToken}`) ?? [])
      .map((id) => orphanClassByPb.get(id))
      .filter(Boolean) as string[];
    if (!classIds.length || !l.userId) return { n: classIds.length, skipped: 0 };
    const own = await prisma.booking.findMany({
      where: { tenantId: l.tenantId, userId: l.userId, classId: { in: classIds } },
      select: { classId: true },
    });
    const taken = new Set(own.map((b) => b.classId));
    const skipped = classIds.filter((c) => taken.has(c)).length;
    return { n: classIds.length - skipped, skipped };
  };

  // Mirror the matcher's email rule: exact lowercase User.email + a Membership
  // for that tenant.
  const unlinked = links.filter((l) => !l.userId);
  const emails = [...new Set(unlinked.map((l) => l.email?.toLowerCase()).filter(Boolean))] as string[];
  const users = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, memberships: { select: { tenantId: true } } },
      })
    : [];
  const userByEmail = new Map(users.map((u) => [u.email!.toLowerCase(), u]));

  const rows: { tenant: string; who: string; state: State; bookings: number; skipped: number; since: string }[] = [];

  for (const l of links) {
    const tenant = l.tenant?.slug ?? l.tenantId;
    const who = l.email ?? l.fullName ?? `token …${l.wellhubUniqueToken.slice(-6)}`;
    const since = l.userLinkedAt?.toISOString().slice(0, 10) ?? "—";
    const { n: bookings, skipped } = await pendingCount(l);

    if (l.userId) {
      rows.push({
        tenant, who, since, bookings, skipped,
        state: bookings > 0 ? "linked · bookings to attribute" : "linked · nothing to do",
      });
      continue;
    }

    if (!l.email && !l.phone) {
      rows.push({ tenant, who, since, bookings, skipped, state: "unlinked · no email/phone" });
      continue;
    }

    const u = l.email ? userByEmail.get(l.email.toLowerCase()) : undefined;
    if (u?.memberships.some((m) => m.tenantId === l.tenantId)) {
      rows.push({ tenant, who, since, bookings, skipped, state: "unlinked · would link (email)" });
      continue;
    }
    if (l.phone) {
      const cands = await prisma.user.findMany({
        where: { phone: l.phone, memberships: { some: { tenantId: l.tenantId } } },
        select: { id: true },
        take: 2,
      });
      if (cands.length === 1) {
        rows.push({ tenant, who, since, bookings, skipped, state: "unlinked · would link (phone)" });
        continue;
      }
      if (cands.length > 1) {
        rows.push({ tenant, who, since, bookings, skipped, state: "unlinked · phone ambiguous" });
        continue;
      }
    }
    rows.push({ tenant, who, since, bookings, skipped, state: "unlinked · no app user" });
  }

  const tally = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.state]: (a[r.state] ?? 0) + 1 }), {});
  console.log(`WellhubUserLink rows: ${links.length}`);
  console.table(tally);

  const actionable = rows.filter(
    (r) => r.state === "linked · bookings to attribute" || r.state.startsWith("unlinked · would link"),
  );
  console.log(`\nActionable: ${actionable.length} people, ${actionable.reduce((s, r) => s + r.bookings, 0)} bookings to attribute`);
  if (actionable.length) console.table(actionable);

  const alreadyFine = rows.filter((r) => r.state === "linked · nothing to do");
  if (alreadyFine.length) {
    console.log(`\nAlready linked and attributed (${alreadyFine.length}):`);
    console.table(alreadyFine);
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to write.");
    return;
  }

  let linkedNow = 0;
  let attributed = 0;
  for (const l of links) {
    if (l.userId) {
      const n = await attributeWellhubBookingsToUser({
        tenantId: l.tenantId,
        userId: l.userId,
        wellhubUniqueToken: l.wellhubUniqueToken,
      });
      attributed += n;
      if (n) console.log(`  attributed ${n} → ${l.email ?? l.fullName}`);
    } else {
      // Real matcher: links AND attributes, or no-ops if nothing matches.
      const out = await tryLinkWellhubUserToMagic({
        tenantId: l.tenantId,
        wellhubUniqueToken: l.wellhubUniqueToken,
      });
      if (out.linked) {
        linkedNow++;
        console.log(`  linked (${out.via}) → ${l.email ?? l.fullName}`);
      }
    }
  }
  console.log(`\nDone. Newly linked: ${linkedNow}. Bookings attributed: ${attributed}.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
