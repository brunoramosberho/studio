/**
 * One-off: remove the two leftover demo accounts from the PRODUCTION `betoro`
 * tenant's client list. Both have ZERO data in betoro.
 *
 *   1. Fer del Valle  <coach-fdv-sculpt-method-0@demo.mgic.app>
 *        - betoro-only, no data anywhere -> deleted globally.
 *   2. María García   <maria@bodybarre.demo>
 *        - also a member of the `bodybarre` tenant where she has real data,
 *          so ONLY her betoro membership is removed (account kept).
 *
 * Guarded: refuses to touch any account that has bookings/packages/coach
 * profile *within betoro*, or that is a super-admin.
 *
 *   npx tsx scripts/cleanup-betoro-demo-accounts.ts            # dry-run
 *   npx tsx scripts/cleanup-betoro-demo-accounts.ts --commit   # apply
 */
import { prisma } from "../lib/db";

const TENANT_SLUG = "betoro";
const DELETE_GLOBALLY = ["coach-fdv-sculpt-method-0@demo.mgic.app"];
const REMOVE_MEMBERSHIP_ONLY = ["maria@bodybarre.demo"];
const COMMIT = process.argv.includes("--commit");

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Tenant '${TENANT_SLUG}' not found`);
  const tid = tenant.id;
  const allEmails = [...DELETE_GLOBALLY, ...REMOVE_MEMBERSHIP_ONLY];

  console.log(`Tenant: ${tenant.name} (${TENANT_SLUG})`);
  console.log(`Mode:   ${COMMIT ? "COMMIT" : "DRY-RUN"}\n`);

  const users = await prisma.user.findMany({
    where: { email: { in: allEmails } },
    select: { id: true, email: true, name: true, isSuperAdmin: true },
  });

  for (const u of users) {
    // Guard: no real betoro data, not super-admin.
    const [bk, up, coach, mems] = await Promise.all([
      prisma.booking.count({ where: { tenantId: tid, userId: u.id } }),
      prisma.userPackage.count({ where: { tenantId: tid, userId: u.id } }),
      prisma.coachProfile.count({ where: { tenantId: tid, userId: u.id } }),
      prisma.membership.findMany({ where: { userId: u.id }, select: { tenant: { select: { slug: true } } } }),
    ]);
    const tenants = mems.map((m) => m.tenant.slug);
    if (u.isSuperAdmin) throw new Error(`Refusing: ${u.email} is super-admin.`);
    if (bk + up + coach > 0) throw new Error(`Refusing: ${u.email} has betoro data (bk=${bk} pkg=${up} coach=${coach}).`);

    const mode = DELETE_GLOBALLY.includes(u.email!) ? "DELETE-USER" : "REMOVE-BETORO-MEMBERSHIP";
    console.log(`${u.email} (${u.name}) — ${mode} | tenants: ${tenants.join(", ")}`);

    if (!COMMIT) continue;

    if (mode === "DELETE-USER") {
      if (tenants.some((s) => s !== TENANT_SLUG)) {
        throw new Error(`Refusing global delete: ${u.email} belongs to other tenants (${tenants.join(", ")}).`);
      }
      await prisma.user.delete({ where: { id: u.id } });
      console.log(`   ✅ user deleted`);
    } else {
      await prisma.membership.deleteMany({ where: { userId: u.id, tenantId: tid } });
      console.log(`   ✅ betoro membership removed (account kept)`);
    }
  }

  if (!COMMIT) {
    console.log("\nDRY-RUN — no changes written. Re-run with --commit to apply.");
    return;
  }

  const clientsLeft = await prisma.membership.count({ where: { tenantId: tid, role: "CLIENT" } });
  console.log(`\nDone. betoro CLIENT memberships now: ${clientsLeft}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
