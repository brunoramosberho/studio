/**
 * One-off: grant ADMIN role to bruno@magicpay.mx on the `lab` tenant.
 * Idempotent: upserts the Membership row.
 */
import { prisma } from "../lib/db";

async function main() {
  const TENANT_SLUG = "lab";
  const EMAIL = "bruno@magicpay.mx";

  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    console.error(`Tenant '${TENANT_SLUG}' not found`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    console.error(
      `User '${EMAIL}' not found. They need to sign in at least once first.`,
    );
    process.exit(1);
  }

  const before = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    select: { role: true, lifecycleStage: true },
  });

  const membership = await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    update: { role: "ADMIN" },
    create: {
      userId: user.id,
      tenantId: tenant.id,
      role: "ADMIN",
    },
    select: { id: true, role: true, lifecycleStage: true, createdAt: true },
  });

  console.log("Tenant:", tenant);
  console.log("User:", user);
  console.log("Before:", before ?? "(no membership existed)");
  console.log("After:", membership);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
