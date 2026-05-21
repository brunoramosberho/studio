/**
 * Register a domain for Apple Pay / Google Pay / Link on a tenant's
 * Stripe Connect account.
 *
 * Background: for direct charges (our setup), registering the domain on
 * the platform account is NOT sufficient — Apple Pay needs the domain
 * registered on the connected merchant's account too. The Stripe Dashboard
 * only exposes domain registration for the platform itself, so we hit the
 * API directly with `stripeAccount` set to the tenant's connected account.
 *
 * Usage:
 *   npx tsx scripts/register-apple-pay-domain.ts <tenant-slug> <domain>
 *
 * Example:
 *   npx tsx scripts/register-apple-pay-domain.ts betoro betoro.mgic.app
 */

import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe/client";

async function main() {
  const slug = process.argv[2];
  const domain = process.argv[3];

  if (!slug || !domain) {
    console.error(
      "Usage: npx tsx scripts/register-apple-pay-domain.ts <tenant-slug> <domain>",
    );
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`Tenant "${slug}" not found`);
    process.exit(1);
  }
  if (!tenant.stripeAccountId) {
    console.error(`Tenant "${slug}" has no Stripe Connect account yet`);
    process.exit(1);
  }

  const stripe = getStripe();

  console.log(
    `Registering ${domain} on connected account ${tenant.stripeAccountId} (${tenant.name})…`,
  );

  try {
    const result = await stripe.paymentMethodDomains.create(
      { domain_name: domain },
      { stripeAccount: tenant.stripeAccountId },
    );
    console.log("\n✓ Registered");
    console.log("  id:           ", result.id);
    console.log("  domain:       ", result.domain_name);
    console.log("  apple_pay:    ", result.apple_pay?.status ?? "unknown");
    console.log("  google_pay:   ", result.google_pay?.status ?? "unknown");
    console.log("  link:         ", result.link?.status ?? "unknown");
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "payment_method_domain_already_exists") {
      console.log("Domain already registered on this connected account.");
    } else {
      console.error("\n✗ Error:", e.message ?? String(err));
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
