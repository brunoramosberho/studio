/**
 * One-off: remove the seed/demo ("fake") COACHES + CLIENTS from the
 * `fdv-sculpt-method` tenant, plus the stray test account maria@example.com.
 *
 * Unlike `lab`, fdv has NO real coach to reassign to — all 31 coaches are demo
 * and teach all 75 (past) classes. Per the owner's decision those classes and
 * their bookings are deleted outright (fdv is a test tenant; only 3 of 333
 * bookings are by real accounts, and all classes are in the past).
 *
 * Kept: the 4 real admins and the real client members. A demo account shared
 * with another tenant (coach-fdv-sculpt-method-0, also in betoro) keeps its
 * global account; only its fdv membership + fdv data are removed.
 *
 *   npx tsx scripts/cleanup-fdv-fake-accounts.ts            # dry-run (default)
 *   npx tsx scripts/cleanup-fdv-fake-accounts.ts --commit   # apply
 */
import { prisma } from "../lib/db";

const TENANT_SLUG = "fdv-sculpt-method";
const EXTRA_EMAILS = ["maria@example.com"]; // non-demo test accounts to also remove
const COMMIT = process.argv.includes("--commit");

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant '${TENANT_SLUG}' not found`);
  const tid = tenant.id;

  const targetMems = await prisma.membership.findMany({
    where: {
      tenantId: tid,
      OR: [{ user: { email: { endsWith: "@demo.mgic.app" } } }, { user: { email: { in: EXTRA_EMAILS } } }],
    },
    select: { userId: true, user: { select: { email: true, isSuperAdmin: true } } },
  });
  if (targetMems.length === 0) {
    console.log("No demo/target accounts found — nothing to do.");
    return;
  }
  const targetIds = targetMems.map((m) => m.userId);
  if (targetMems.some((m) => m.user?.isSuperAdmin)) {
    throw new Error("Refusing: a target account is a super-admin.");
  }

  // Demo coach profiles in fdv + the classes they teach (all fdv classes here).
  const demoCoaches = await prisma.coachProfile.findMany({
    where: { tenantId: tid, user: { email: { endsWith: "@demo.mgic.app" } } },
    select: { id: true },
  });
  const demoCoachIds = demoCoaches.map((c) => c.id);
  const demoClasses = await prisma.class.findMany({
    where: { tenantId: tid, coachId: { in: demoCoachIds } },
    select: { id: true },
  });
  const demoClassIds = demoClasses.map((c) => c.id);

  // Keep-globally set: targets that also belong to other tenants.
  const otherMems = await prisma.membership.findMany({
    where: { userId: { in: targetIds }, tenantId: { not: tid } },
    select: { userId: true },
  });
  const sharedIds = new Set(otherMems.map((m) => m.userId));
  const fdvOnlyIds = targetIds.filter((id) => !sharedIds.has(id));

  const inTarget = { in: targetIds } as const;
  const fdvFeed = { feedEvent: { tenantId: tid }, userId: inTarget } as const;

  const bookingsOnClasses = await prisma.booking.count({ where: { classId: { in: demoClassIds } } });
  const [fe, lk, cm, ph, nt, mp, ma, mr] = await Promise.all([
    prisma.feedEvent.count({ where: { tenantId: tid, userId: inTarget } }),
    prisma.like.count({ where: fdvFeed }),
    prisma.comment.count({ where: fdvFeed }),
    prisma.photo.count({ where: fdvFeed }),
    prisma.notification.count({ where: { tenantId: tid, userId: inTarget } }),
    prisma.memberProgress.count({ where: { tenantId: tid, userId: inTarget } }),
    prisma.memberAchievement.count({ where: { tenantId: tid, userId: inTarget } }),
    prisma.memberReward.count({ where: { tenantId: tid, userId: inTarget } }),
  ]);

  console.log(`Tenant: ${tenant.name} (${TENANT_SLUG})`);
  console.log(`Mode:   ${COMMIT ? "COMMIT" : "DRY-RUN"}`);
  console.log(`Target accounts: ${targetIds.length}  (fdv-only deleted globally: ${fdvOnlyIds.length}, shared kept: ${sharedIds.size})`);
  if (sharedIds.size) {
    console.log(`Shared (kept globally): ${targetMems.filter((m) => sharedIds.has(m.userId)).map((m) => m.user?.email).join(", ")}`);
  }
  console.log(`\nWill delete:`);
  console.log(`  demo coach profiles: ${demoCoachIds.length}`);
  console.log(`  classes (taught by demo coaches): ${demoClassIds.length}  -> cascades bookings=${bookingsOnClasses}`);
  console.log(`  feedEvents=${fe} likes=${lk} comments=${cm} photos=${ph} notifications=${nt}`);
  console.log(`  memberProgress=${mp} memberAchievement=${ma} memberReward=${mr}`);
  console.log(`  fdv memberships removed: ${targetIds.length}`);
  console.log(`  user accounts deleted (fdv-only): ${fdvOnlyIds.length}`);

  if (!COMMIT) {
    console.log("\nDRY-RUN — no changes written. Re-run with --commit to apply.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      // 1) Delete demo-coach classes (cascades bookings, waitlist, check-ins,
      //    song requests, etc. on those classes).
      await tx.class.deleteMany({ where: { tenantId: tid, id: { in: demoClassIds } } });
      // 2) Delete demo coach profiles (payRates cascade; classes now gone).
      await tx.coachProfile.deleteMany({ where: { id: { in: demoCoachIds } } });
      // 3) Clear remaining user-level Restrict blockers (fdv-scoped).
      await tx.like.deleteMany({ where: fdvFeed });
      await tx.comment.deleteMany({ where: fdvFeed });
      await tx.photo.deleteMany({ where: fdvFeed });
      await tx.feedEvent.deleteMany({ where: { tenantId: tid, userId: inTarget } });
      await tx.notification.deleteMany({ where: { tenantId: tid, userId: inTarget } });
      await tx.checkIn.deleteMany({ where: { tenantId: tid, memberId: inTarget } });
      await tx.booking.deleteMany({ where: { tenantId: tid, userId: inTarget } }); // safety; should be 0 after class delete
      // 3b) UserPackage is a Restrict relation -> delete explicitly (its credit
      //     usage cascades; entitlement.userPackageId is SetNull, and the
      //     entitlement itself cascades when the user is deleted below).
      await tx.userPackage.deleteMany({ where: { tenantId: tid, userId: inTarget } });
      // 4) Gamification (tenant-scoped). NudgeEvent + classRating cascade on
      //    user delete; PosTransaction.member is SetNull. No explicit handling.
      await tx.memberReward.deleteMany({ where: { tenantId: tid, userId: inTarget } });
      await tx.memberAchievement.deleteMany({ where: { tenantId: tid, userId: inTarget } });
      await tx.memberProgress.deleteMany({ where: { tenantId: tid, userId: inTarget } });
      // 5) Remove every target's fdv membership.
      await tx.membership.deleteMany({ where: { tenantId: tid, userId: inTarget } });
      // 6) Delete fdv-only target users entirely (cascade global leftovers).
      if (fdvOnlyIds.length) {
        await tx.user.deleteMany({
          where: {
            id: { in: fdvOnlyIds },
            OR: [{ email: { endsWith: "@demo.mgic.app" } }, { email: { in: EXTRA_EMAILS } }],
          },
        });
      }
    },
    { timeout: 120_000 },
  );

  const remainingDemo = await prisma.membership.count({
    where: { tenantId: tid, user: { email: { endsWith: "@demo.mgic.app" } } },
  });
  const totalMembers = await prisma.membership.count({ where: { tenantId: tid } });
  const remainingClasses = await prisma.class.count({ where: { tenantId: tid } });
  console.log(`\n✅ Done. Remaining demo members: ${remainingDemo}. Total fdv members: ${totalMembers}. fdv classes: ${remainingClasses}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
