/**
 * One-off: remove the seed/demo ("fake") MEMBERS from the `lab` tenant.
 *
 * The seeder created demo users with `@demo.mgic.app` emails (members + the
 * already-removed demo coaches, now downgraded to CLIENT). This wipes their
 * lab footprint so they disappear from the member list and class rosters,
 * WITHOUT touching the 7.4k real members imported from history.
 *
 * Scope & safety:
 *   - Only `@demo.mgic.app` memberships of the `lab` tenant are affected.
 *   - All dependent data is deleted lab-scoped (bookings, feed events + their
 *     likes/comments/photos, notifications, check-ins, gamification rows).
 *   - Users whose ONLY membership is `lab` are deleted entirely (cascade).
 *   - A demo user shared with other tenants (e.g. coach-lab-0, also in
 *     betoro/fdv-sculpt-method) keeps its global account; only its lab
 *     membership + lab data are removed.
 *
 *   npx tsx scripts/cleanup-lab-fake-members.ts            # dry-run (default)
 *   npx tsx scripts/cleanup-lab-fake-members.ts --commit   # apply
 */
import { prisma } from "../lib/db";

const TENANT_SLUG = "lab";
const COMMIT = process.argv.includes("--commit");

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant '${TENANT_SLUG}' not found`);
  const tid = tenant.id;

  const demoMems = await prisma.membership.findMany({
    where: { tenantId: tid, user: { email: { endsWith: "@demo.mgic.app" } } },
    select: { userId: true, user: { select: { email: true, isSuperAdmin: true } } },
  });
  if (demoMems.length === 0) {
    console.log("No demo members found — nothing to do.");
    return;
  }
  const demoIds = demoMems.map((m) => m.userId);
  if (demoMems.some((m) => m.user?.isSuperAdmin)) {
    throw new Error("Refusing to run: a demo user is a super-admin.");
  }

  // Which demo users belong to OTHER tenants too? Those keep their account.
  const otherMems = await prisma.membership.findMany({
    where: { userId: { in: demoIds }, tenantId: { not: tid } },
    select: { userId: true },
  });
  const sharedIds = new Set(otherMems.map((m) => m.userId));
  const labOnlyIds = demoIds.filter((id) => !sharedIds.has(id));

  const inDemo = { in: demoIds } as const;
  const labFeed = { feedEvent: { tenantId: tid }, userId: inDemo } as const;

  console.log(`Tenant: ${tenant.name} (${TENANT_SLUG})`);
  console.log(`Mode:   ${COMMIT ? "COMMIT" : "DRY-RUN"}`);
  console.log(`Demo members: ${demoIds.length}  (lab-only: ${labOnlyIds.length}, shared: ${sharedIds.size})`);
  if (sharedIds.size) {
    console.log(`Shared (kept globally): ${demoMems.filter((m) => sharedIds.has(m.userId)).map((m) => m.user?.email).join(", ")}`);
  }

  const [bk, fe, lk, cm, ph, nt, ci, mp, ma, mr] = await Promise.all([
    prisma.booking.count({ where: { tenantId: tid, userId: inDemo } }),
    prisma.feedEvent.count({ where: { tenantId: tid, userId: inDemo } }),
    prisma.like.count({ where: labFeed }),
    prisma.comment.count({ where: labFeed }),
    prisma.photo.count({ where: labFeed }),
    prisma.notification.count({ where: { tenantId: tid, userId: inDemo } }),
    prisma.checkIn.count({ where: { tenantId: tid, memberId: inDemo } }),
    prisma.memberProgress.count({ where: { tenantId: tid, userId: inDemo } }),
    prisma.memberAchievement.count({ where: { tenantId: tid, userId: inDemo } }),
    prisma.memberReward.count({ where: { tenantId: tid, userId: inDemo } }),
  ]);
  console.log(`\nWill delete (lab-scoped):`);
  console.log(`  bookings=${bk} feedEvents=${fe} likes=${lk} comments=${cm} photos=${ph}`);
  console.log(`  notifications=${nt} checkIns=${ci} memberProgress=${mp} memberAchievement=${ma} memberReward=${mr}`);
  console.log(`  lab memberships removed: ${demoIds.length}`);
  console.log(`  user accounts deleted (lab-only): ${labOnlyIds.length}`);

  if (!COMMIT) {
    console.log("\nDRY-RUN — no changes written. Re-run with --commit to apply.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      // Reactions BY demo users on lab feed (Restrict relations).
      await tx.like.deleteMany({ where: labFeed });
      await tx.comment.deleteMany({ where: labFeed });
      await tx.photo.deleteMany({ where: labFeed });
      // Demo-authored lab feed events (cascades remaining attached reactions).
      await tx.feedEvent.deleteMany({ where: { tenantId: tid, userId: inDemo } });
      // Other Restrict relations.
      await tx.notification.deleteMany({ where: { tenantId: tid, userId: inDemo } });
      await tx.checkIn.deleteMany({ where: { tenantId: tid, memberId: inDemo } });
      // Fake bookings (userId would otherwise be SET NULL -> orphan roster).
      await tx.booking.deleteMany({ where: { tenantId: tid, userId: inDemo } });
      // Gamification (tenant-scoped; cascade would also cover lab-only users).
      await tx.memberReward.deleteMany({ where: { tenantId: tid, userId: inDemo } });
      await tx.memberAchievement.deleteMany({ where: { tenantId: tid, userId: inDemo } });
      await tx.memberProgress.deleteMany({ where: { tenantId: tid, userId: inDemo } });
      // Remove every demo lab membership (incl. the shared account's).
      await tx.membership.deleteMany({ where: { tenantId: tid, userId: inDemo } });
      // Delete lab-only demo user accounts entirely (cascades global leftovers
      // like friendships, sessions, accounts, push subscriptions).
      if (labOnlyIds.length) {
        await tx.user.deleteMany({ where: { id: { in: labOnlyIds }, email: { endsWith: "@demo.mgic.app" } } });
      }
    },
    { timeout: 60_000 },
  );

  const remainingDemo = await prisma.membership.count({
    where: { tenantId: tid, user: { email: { endsWith: "@demo.mgic.app" } } },
  });
  const totalMembers = await prisma.membership.count({ where: { tenantId: tid } });
  console.log(`\n✅ Done. Remaining demo members in lab: ${remainingDemo}. Total lab members: ${totalMembers}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
