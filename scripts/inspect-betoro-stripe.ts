import { prisma } from "../lib/db";

async function main() {
  const t = await prisma.tenant.findUnique({
    where: { slug: "betoro" },
    select: {
      slug: true,
      stripeSandboxMode: true,
      stripeAccountId: true,
      stripeAccountStatus: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      applicationFeePercent: true,
      defaultCountry: { select: { code: true, currency: true } },
    },
  });
  console.log(JSON.stringify(t, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
