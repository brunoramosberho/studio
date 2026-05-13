import Stripe from "stripe";

const ACCOUNT_ID = "acct_1TJh91Hvyj6gRD2x";

async function main() {
  const testKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!testKey) {
    console.error("STRIPE_SECRET_KEY missing in .env");
    process.exit(1);
  }
  const mode = testKey.startsWith("sk_live_") ? "LIVE" : "TEST";
  console.log(`Using local STRIPE_SECRET_KEY (${mode} mode)`);
  const stripe = new Stripe(testKey);
  try {
    const acct = await stripe.accounts.retrieve(ACCOUNT_ID);
    console.log("✓ Account exists in this mode:");
    console.log(
      JSON.stringify(
        {
          id: acct.id,
          country: acct.country,
          charges_enabled: acct.charges_enabled,
          payouts_enabled: acct.payouts_enabled,
          email: acct.email,
          created: new Date((acct.created ?? 0) * 1000).toISOString(),
        },
        null,
        2,
      ),
    );
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    console.log(`✗ Account NOT found in this mode: ${e.code ?? e.message}`);
    console.log(
      mode === "TEST"
        ? "  → account is likely a LIVE account (good — keep it)"
        : "  → account is likely a TEST account (need to clear it before live onboarding)",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
