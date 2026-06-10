/**
 * One-off: fully delete the shared demo user `coach-lab-0@demo.mgic.app`
 * (display name "Luciana") from ALL tenants.
 *
 * This seeded demo account was shared across lab / betoro / fdv-sculpt-method,
 * which is wrong. After the lab member cleanup it holds ZERO data in every
 * tenant (no coach profile, no bookings, no feed/notifications), so it can be
 * hard-deleted. Cascades remove its memberships, friendships, and sessions.
 *
 * Guarded: refuses unless the account is an @demo.mgic.app, non-super-admin
 * user with no coach profiles and no bookings anywhere.
 *
 *   npx tsx scripts/delete-shared-demo-user.ts            # dry-run (default)
 *   npx tsx scripts/delete-shared-demo-user.ts --commit   # apply
 */
import { prisma } from "../lib/db";

const EMAIL = "coach-lab-0@demo.mgic.app";
const COMMIT = process.argv.includes("--commit");

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, name: true, email: true, isSuperAdmin: true },
  });
  if (!user) {
    console.log(`User ${EMAIL} not found — nothing to do.`);
    return;
  }

  // Safety guards.
  if (!user.email?.endsWith("@demo.mgic.app")) throw new Error("Not a demo account — refusing.");
  if (user.isSuperAdmin) throw new Error("Account is super-admin — refusing.");

  const [coachProfiles, bookings, feed, memberships, friendships, sessions] = await Promise.all([
    prisma.coachProfile.count({ where: { userId: user.id } }),
    prisma.booking.count({ where: { userId: user.id } }),
    prisma.feedEvent.count({ where: { userId: user.id } }),
    prisma.membership.findMany({ where: { userId: user.id }, select: { tenant: { select: { slug: true } } } }),
    prisma.friendship.count({ where: { OR: [{ requesterId: user.id }, { addresseeId: user.id }] } }),
    prisma.session.count({ where: { userId: user.id } }),
  ]);

  console.log(`User: ${user.name} <${user.email}> [${user.id}]`);
  console.log(`Mode: ${COMMIT ? "COMMIT" : "DRY-RUN"}`);
  console.log(`Memberships: ${memberships.map((m) => m.tenant.slug).join(", ") || "(none)"}`);
  console.log(`coachProfiles=${coachProfiles} bookings=${bookings} feedEvents=${feed} friendships=${friendships} sessions=${sessions}`);

  if (coachProfiles > 0 || bookings > 0 || feed > 0) {
    throw new Error("Account still has coach/booking/feed data — refusing to hard-delete. Clean it first.");
  }

  if (!COMMIT) {
    console.log("\nDRY-RUN — no changes written. Re-run with --commit to apply.");
    return;
  }

  await prisma.user.delete({ where: { id: user.id } });
  const gone = !(await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } }));
  console.log(`\n✅ Deleted. User no longer exists: ${gone}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
