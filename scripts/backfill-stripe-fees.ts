/**
 * Backfill stripeFee / netAmount / availableOn on existing succeeded
 * StripePayment rows by re-expanding the PaymentIntent's latest_charge.
 *
 * Existing succeeded payments don't carry this data because the original
 * webhook handler didn't expand the balance_transaction. New payments will
 * have it from `payment_intent.succeeded` going forward — this script is
 * for the historical rows.
 *
 * Usage:
 *   npx tsx scripts/backfill-stripe-fees.ts                    # all tenants
 *   npx tsx scripts/backfill-stripe-fees.ts <tenant-slug>      # one tenant
 *
 * Idempotent: skips rows that already have stripeFee populated.
 */

// Minimal .env loader — tsx doesn't auto-load env files.
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(filename: string): void {
  try {
    const content = readFileSync(join(process.cwd(), filename), "utf-8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // file not present — skip
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

async function main() {
  const slugFilter = process.argv[2];

  const { prisma } = await import("@/lib/db");
  const { getStripeClientForTenantId } = await import(
    "@/lib/stripe/tenant-stripe"
  );

  const tenants = await prisma.tenant.findMany({
    where: {
      ...(slugFilter && { slug: slugFilter }),
      stripeAccountId: { not: null },
    },
    select: { id: true, slug: true, name: true, stripeAccountId: true },
  });

  if (tenants.length === 0) {
    console.error("No tenants found");
    await prisma.$disconnect();
    process.exit(1);
  }

  for (const tenant of tenants) {
    console.log(`\n— ${tenant.name} (${tenant.slug}) —`);
    const stripe = await getStripeClientForTenantId(tenant.id);

    const payments = await prisma.stripePayment.findMany({
      where: {
        tenantId: tenant.id,
        status: "succeeded",
        stripeFee: null,
      },
      select: { id: true, stripePaymentIntentId: true, amount: true },
      orderBy: { createdAt: "desc" },
    });

    if (payments.length === 0) {
      console.log("  Nothing to backfill.");
      continue;
    }

    console.log(`  ${payments.length} payment(s) to backfill`);
    let ok = 0;
    let fail = 0;

    for (const p of payments) {
      try {
        const pi = await stripe.paymentIntents.retrieve(
          p.stripePaymentIntentId,
          { expand: ["latest_charge.balance_transaction"] },
          { stripeAccount: tenant.stripeAccountId! },
        );
        const charge =
          typeof pi.latest_charge === "object" && pi.latest_charge
            ? pi.latest_charge
            : null;
        const bt =
          charge && typeof charge.balance_transaction === "object"
            ? charge.balance_transaction
            : null;
        if (!bt) {
          console.log(
            `    skip ${p.stripePaymentIntentId} — no balance_transaction`,
          );
          continue;
        }
        await prisma.stripePayment.update({
          where: { id: p.id },
          data: {
            stripeFee: bt.fee / 100,
            netAmount: bt.net / 100,
            availableOn: bt.available_on
              ? new Date(bt.available_on * 1000)
              : null,
          },
        });
        ok++;
      } catch (err) {
        fail++;
        console.error(
          `    error ${p.stripePaymentIntentId}:`,
          (err as { message?: string }).message ?? err,
        );
      }
    }
    console.log(`  ✓ ${ok} updated, ✗ ${fail} failed`);
  }

  await prisma.$disconnect();
}

main();
