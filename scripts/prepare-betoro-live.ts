/**
 * One-shot: clear Betoro's stale test Stripe Connect account and set the
 * negotiated live application fee. Run before re-onboarding Betoro on the
 * billing page so a fresh acct_* is created with the live platform key.
 */
import { prisma } from "../lib/db";

async function main() {
  const before = await prisma.tenant.findUnique({
    where: { slug: "betoro" },
    select: {
      stripeAccountId: true,
      stripeAccountStatus: true,
      applicationFeePercent: true,
      stripeSandboxMode: true,
    },
  });
  console.log("Before:", JSON.stringify(before, null, 2));

  const updated = await prisma.tenant.update({
    where: { slug: "betoro" },
    data: {
      stripeAccountId: null,
      stripeAccountStatus: null,
      applicationFeePercent: 0.5,
    },
    select: {
      stripeAccountId: true,
      stripeAccountStatus: true,
      applicationFeePercent: true,
      stripeSandboxMode: true,
    },
  });
  console.log("After: ", JSON.stringify(updated, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
