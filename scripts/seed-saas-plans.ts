/**
 * Seed the `SaasPlan` catalog with the live Magic Studio plans (EUR).
 *
 * Idempotent: upserts by the unique (planKey, countryCode) constraint. Safe
 * to run repeatedly — values get overwritten with whatever is defined below.
 *
 * Run with:
 *   npx tsx scripts/seed-saas-plans.ts
 *
 * Live Stripe Price IDs are committed here intentionally — they are catalog
 * identifiers, not secrets. The actual secret key + webhook signing keys live
 * in Vercel env vars.
 */
import { prisma } from "../lib/db";
import { SAAS_PLAN_GLOBAL_COUNTRY } from "../lib/stripe/saas-plans";

type SeedRow = {
  planKey: string;
  name: string;
  stripePriceId: string;
  amountCents: number;
  sortOrder: number;
};

const PLANS: SeedRow[] = [
  {
    planKey: "starter",
    name: "Mgic Studio Starter",
    stripePriceId: "price_1TWYJDHhupSP0fAL7QHsDLdR",
    amountCents: 29900, // €299
    sortOrder: 1,
  },
  {
    planKey: "growth",
    name: "Mgic Studio Growth",
    stripePriceId: "price_1TWYJiHhupSP0fAL5CCJ3X8h",
    amountCents: 44900, // €449
    sortOrder: 2,
  },
  {
    planKey: "scale",
    name: "Mgic Studio Scale",
    stripePriceId: "price_1TWYKvHhupSP0fALakWoOE8X",
    amountCents: 69900, // €699
    sortOrder: 3,
  },
];

async function main() {
  for (const p of PLANS) {
    const row = await prisma.saasPlan.upsert({
      where: {
        planKey_countryCode: {
          planKey: p.planKey,
          countryCode: SAAS_PLAN_GLOBAL_COUNTRY,
        },
      },
      update: {
        name: p.name,
        stripePriceId: p.stripePriceId,
        amountCents: p.amountCents,
        currency: "eur",
        sortOrder: p.sortOrder,
        isActive: true,
      },
      create: {
        planKey: p.planKey,
        countryCode: SAAS_PLAN_GLOBAL_COUNTRY,
        name: p.name,
        stripePriceId: p.stripePriceId,
        amountCents: p.amountCents,
        currency: "eur",
        sortOrder: p.sortOrder,
        isActive: true,
      },
    });
    console.log(
      `✓ ${row.planKey.padEnd(8)} → ${row.stripePriceId}  ${(row.amountCents! / 100).toFixed(2)} ${row.currency.toUpperCase()}`,
    );
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
