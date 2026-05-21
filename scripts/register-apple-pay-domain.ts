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

// Minimal .env loader — `tsx` doesn't auto-load env files. Must run before
// importing modules that read process.env at import time (Prisma, Stripe).
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
  const slug = process.argv[2];
  const domain = process.argv[3];

  if (!slug || !domain) {
    console.error(
      "Usage: npx tsx scripts/register-apple-pay-domain.ts <tenant-slug> <domain>",
    );
    process.exit(1);
  }

  // Lazy-load so the env-loader above has a chance to populate DATABASE_URL
  // and STRIPE_SECRET_KEY before the Prisma / Stripe clients initialize.
  const { prisma } = await import("@/lib/db");
  const { getStripeClientForTenantId } = await import("@/lib/stripe/tenant-stripe");

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`Tenant "${slug}" not found`);
    process.exit(1);
  }
  if (!tenant.stripeAccountId) {
    console.error(`Tenant "${slug}" has no Stripe Connect account yet`);
    process.exit(1);
  }

  // Pick the Stripe SDK that matches the tenant's mode (live or sandbox).
  // If the env var is mismatched (e.g. local .env has a test key but the
  // tenant is live), bail with a clear instruction instead of letting
  // Stripe respond with the cryptic "key does not have access" error.
  const stripe = await getStripeClientForTenantId(tenant.id);
  const usingTestKey = (stripe as unknown as { _api?: { auth?: string } })._api?.auth?.includes(
    "sk_test_",
  );
  const tenantIsLive = !tenant.stripeSandboxMode;
  if (tenantIsLive && usingTestKey) {
    console.error(
      `\n✗ Tenant "${slug}" is in LIVE mode but STRIPE_SECRET_KEY in your env is a TEST key.\n` +
        `  Re-run with the live key explicitly:\n` +
        `    STRIPE_SECRET_KEY=sk_live_xxx npx tsx scripts/register-apple-pay-domain.ts ${slug} ${domain}\n`,
    );
    process.exit(1);
  }

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
