/**
 * Find any UserPackages / bookings / payments tied to brunoramosberho@gmail.com,
 * across all tenants, so we know what to clean up.
 */
import { prisma } from "../lib/db";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "brunoramosberho@gmail.com" },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    console.log("User not found");
    return;
  }
  console.log(`User: ${user.email} (id=${user.id})\n`);

  const packs = await prisma.userPackage.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      status: true,
      tenantId: true,
      packageId: true,
      package: { select: { name: true, type: true, price: true, currency: true } },
      tenant: { select: { slug: true } },
      purchasedAt: true,
      expiresAt: true,
    },
    orderBy: { purchasedAt: "desc" },
  });
  console.log(`UserPackages: ${packs.length}`);
  for (const p of packs) {
    console.log(
      `  ${p.tenant.slug.padEnd(8)} | ${p.package.type.padEnd(22)} | ${p.package.name.padEnd(28)} | ${p.package.price} ${p.package.currency} | ${p.status} | purchased=${p.purchasedAt.toISOString()} | id=${p.id}`,
    );
  }

  const subs = await prisma.memberSubscription.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      status: true,
      stripeSubscriptionId: true,
      tenantId: true,
      package: { select: { name: true, type: true } },
      tenant: { select: { slug: true } },
    },
  });
  console.log(`\nMemberSubscriptions: ${subs.length}`);
  for (const s of subs) {
    console.log(`  ${s.tenant.slug.padEnd(8)} | ${s.package.type.padEnd(22)} | ${s.package.name.padEnd(28)} | ${s.status} | ${s.stripeSubscriptionId} | id=${s.id}`);
  }

  const ents = await prisma.entitlement.findMany({
    where: { userId: user.id },
    select: { id: true, type: true, status: true, tenant: { select: { slug: true } } },
  });
  console.log(`\nEntitlements: ${ents.length}`);
  for (const e of ents) console.log(`  ${e.tenant.slug.padEnd(8)} | ${e.type.padEnd(12)} | ${e.status} | id=${e.id}`);

  const pays = await prisma.stripePayment.findMany({
    where: { userId: user.id },
    select: { id: true, amount: true, currency: true, status: true, type: true, tenant: { select: { slug: true } } },
  });
  console.log(`\nStripePayments: ${pays.length}`);
  for (const p of pays) console.log(`  ${p.tenant.slug.padEnd(8)} | ${p.type.padEnd(12)} | ${p.amount} ${p.currency} | ${p.status} | id=${p.id}`);

  const bookings = await prisma.booking.count({ where: { userId: user.id } });
  const customers = await prisma.stripeCustomer.findMany({
    where: { userId: user.id },
    select: { id: true, stripeCustomerId: true, tenant: { select: { slug: true } } },
  });
  console.log(`\nBookings:           ${bookings}`);
  console.log(`StripeCustomers:    ${customers.length}`);
  for (const c of customers) console.log(`  ${c.tenant.slug.padEnd(8)} | ${c.stripeCustomerId} | id=${c.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
