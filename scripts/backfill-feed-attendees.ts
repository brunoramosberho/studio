/**
 * Backfill guest/platform (Wellhub, Gympass) attendees into existing
 * CLASS_COMPLETED feed posts.
 *
 * Purely additive: it keeps each post's existing attendee list untouched and
 * only appends guest/platform bookings (userId null, not cancelled/no-show)
 * that aren't already represented. A guest whose email matches a member of the
 * tenant is appended as that member (tappable); otherwise as a non-tappable
 * name + initials avatar. Idempotent — safe to run more than once.
 *
 *   npx tsx scripts/backfill-feed-attendees.ts          # apply
 *   npx tsx scripts/backfill-feed-attendees.ts --dry    # report only
 */
import { prisma } from "@/lib/db";
import { buildClassAttendees } from "@/lib/feed/attendees";

const DRY = process.argv.includes("--dry");

async function main() {
  const events = await prisma.feedEvent.findMany({
    where: { eventType: "CLASS_COMPLETED" },
    select: { id: true, tenantId: true, payload: true },
  });

  let scanned = 0;
  let changed = 0;
  let guestsAdded = 0;

  for (const ev of events) {
    scanned++;
    const payload = (ev.payload as Record<string, unknown>) ?? {};
    const classId = payload.classId as string | undefined;
    if (!classId) continue;

    const prev = (payload.attendees as { id: string }[]) ?? [];
    const prevIds = new Set(prev.map((a) => a.id));

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ev.tenantId },
      include: {
        bookings: {
          // Only guest / platform bookings (no linked user) that weren't
          // cancelled or marked no-show. We never recompute member attendance.
          where: { userId: null, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
    });
    if (!cls || cls.bookings.length === 0) continue;

    const guests = await buildClassAttendees(cls.bookings, ev.tenantId);
    const toAppend = guests.filter((a) => !prevIds.has(a.id));
    if (toAppend.length === 0) continue;

    const attendees = [...prev, ...toAppend];
    guestsAdded += toAppend.length;
    changed++;

    console.log(
      `${DRY ? "[dry] " : ""}post ${ev.id} (${(payload.className as string) ?? "?"}): ` +
        `+${toAppend.length} → ${attendees.length} attendees ` +
        `[${toAppend.map((a) => a.name).join(", ")}]`,
    );

    if (!DRY) {
      await prisma.feedEvent.update({
        where: { id: ev.id },
        data: {
          payload: { ...payload, attendees, attendeeCount: attendees.length },
        },
      });
    }
  }

  console.log(
    `\n${DRY ? "[dry] " : ""}Done. Scanned ${scanned} posts, ${changed} updated, ${guestsAdded} guest attendees added.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
