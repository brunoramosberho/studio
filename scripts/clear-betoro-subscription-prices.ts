/**
 * Null the stripePriceId for Betoro's recurring packages. They currently
 * reference test-mode Prices on the old test Connect account. When the first
 * live-mode subscription is created (via the admin UI or member checkout),
 * ensureStripePrice() will mint fresh Product + Price on the new live
 * Connect account.
 */
import { prisma } from "../lib/db";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: "betoro" },
    select: { id: true },
  });

  const before = await prisma.package.findMany({
    where: {
      tenantId: tenant.id,
      type: { in: ["SUBSCRIPTION", "ON_DEMAND_SUBSCRIPTION"] },
    },
    select: { id: true, name: true, type: true, stripePriceId: true },
  });
  console.log("Before:");
  for (const p of before) console.log(`  ${p.type.padEnd(22)} | ${p.name.padEnd(28)} | ${p.stripePriceId}`);

  const result = await prisma.package.updateMany({
    where: {
      tenantId: tenant.id,
      type: { in: ["SUBSCRIPTION", "ON_DEMAND_SUBSCRIPTION"] },
      stripePriceId: { not: null },
    },
    data: { stripePriceId: null },
  });
  console.log(`\nCleared ${result.count} stripePriceId references.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
