/**
 * One-off: remove the seed/demo ("fake") coaches from the `lab` tenant.
 *
 * The demo coaches were created by the seeder with `coach-lab-N@demo.mgic.app`
 * emails. Several have classes assigned, which blocks hard deletion. To delete
 * them WITHOUT destroying any booking history, their classes are first
 * reassigned, then the demo CoachProfiles are deleted:
 *   - PAST classes   -> "Equipo LAB" (the placeholder holding imported history)
 *   - FUTURE classes -> a real coach ("Luciana Amodio"), so upcoming classes
 *     show a real instructor.
 *
 * Bookings, check-ins, revenue, etc. are untouched — only `Class.coachId`
 * changes. The demo user accounts are kept but their tenant membership role is
 * downgraded COACH -> CLIENT (mirrors the admin "delete coach" endpoint), so no
 * orphaned COACH role remains.
 *
 *   npx tsx scripts/cleanup-lab-fake-coaches.ts            # dry-run (default)
 *   npx tsx scripts/cleanup-lab-fake-coaches.ts --commit   # apply
 */
import { prisma } from "../lib/db";

const TENANT_SLUG = "lab";
const PLACEHOLDER_COACH_NAME = "Equipo LAB"; // past classes
const FUTURE_COACH_NAME = "Luciana Amodio"; // future classes
const COMMIT = process.argv.includes("--commit");

async function main() {
  const now = new Date();
  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant '${TENANT_SLUG}' not found`);
  const tid = tenant.id;

  const placeholder = await prisma.coachProfile.findFirst({
    where: { tenantId: tid, name: PLACEHOLDER_COACH_NAME },
    select: { id: true, name: true },
  });
  if (!placeholder) throw new Error(`Placeholder coach '${PLACEHOLDER_COACH_NAME}' not found`);

  const futureCoach = await prisma.coachProfile.findFirst({
    where: { tenantId: tid, name: FUTURE_COACH_NAME, user: { email: { not: { endsWith: "@demo.mgic.app" } } } },
    select: { id: true, name: true },
  });
  if (!futureCoach) throw new Error(`Future coach '${FUTURE_COACH_NAME}' not found`);

  const fake = await prisma.coachProfile.findMany({
    where: { tenantId: tid, user: { email: { endsWith: "@demo.mgic.app" } } },
    select: { id: true, name: true, userId: true, user: { select: { email: true } } },
  });
  if (fake.length === 0) {
    console.log("No demo coaches found — nothing to do.");
    return;
  }
  const fakeIds = fake.map((f) => f.id);
  const fakeUserIds = fake.map((f) => f.userId).filter((x): x is string => !!x);

  console.log(`Tenant: ${tenant.name} (${TENANT_SLUG})`);
  console.log(`Mode:   ${COMMIT ? "COMMIT" : "DRY-RUN"}`);
  console.log(`Past classes  -> ${placeholder.name} [${placeholder.id}]`);
  console.log(`Future classes-> ${futureCoach.name} [${futureCoach.id}]\n`);

  // Per-coach breakdown
  for (const f of fake) {
    const past = await prisma.class.count({ where: { tenantId: tid, coachId: f.id, startsAt: { lt: now } } });
    const future = await prisma.class.count({ where: { tenantId: tid, coachId: f.id, startsAt: { gte: now } } });
    console.log(`  - ${f.name.padEnd(12)} ${f.user?.email?.padEnd(26)} classes: ${past} past / ${future} future`);
  }

  const pastToReassign = await prisma.class.count({ where: { tenantId: tid, coachId: { in: fakeIds }, startsAt: { lt: now } } });
  const futureToReassign = await prisma.class.count({ where: { tenantId: tid, coachId: { in: fakeIds }, startsAt: { gte: now } } });
  const origToReassign = await prisma.class.count({ where: { tenantId: tid, originalCoachId: { in: fakeIds } } });
  console.log(`\nPast classes -> ${placeholder.name}: ${pastToReassign}`);
  console.log(`Future classes -> ${futureCoach.name}: ${futureToReassign}`);
  console.log(`Classes to reassign (originalCoachId -> ${placeholder.name}): ${origToReassign}`);
  console.log(`Coach profiles to delete: ${fakeIds.length}`);
  console.log(`Demo memberships to downgrade COACH->CLIENT: ${fakeUserIds.length}`);

  if (!COMMIT) {
    console.log("\nDRY-RUN — no changes written. Re-run with --commit to apply.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Future classes -> a real coach so upcoming schedule shows a real name.
    await tx.class.updateMany({
      where: { tenantId: tid, coachId: { in: fakeIds }, startsAt: { gte: now } },
      data: { coachId: futureCoach.id },
    });
    // Past classes -> placeholder (preserves history attribution bucket).
    await tx.class.updateMany({
      where: { tenantId: tid, coachId: { in: fakeIds }, startsAt: { lt: now } },
      data: { coachId: placeholder.id },
    });
    await tx.class.updateMany({
      where: { tenantId: tid, originalCoachId: { in: fakeIds } },
      data: { originalCoachId: placeholder.id },
    });
    // Downgrade demo coach memberships so no orphan COACH role remains.
    await tx.membership.updateMany({
      where: { tenantId: tid, userId: { in: fakeUserIds }, role: "COACH" },
      data: { role: "CLIENT" },
    });
    // CoachPayRate cascades; OnDemandVideo.coachProfileId is SetNull.
    await tx.coachProfile.deleteMany({ where: { id: { in: fakeIds } } });
  });

  const remaining = await prisma.coachProfile.count({ where: { tenantId: tid } });
  console.log(`\n✅ Done. Deleted ${fakeIds.length} demo coaches. Remaining coaches: ${remaining}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
