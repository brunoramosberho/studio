import Stripe from "stripe";
import { getStripe } from "./client";

function constructWithFirstMatchingSecret(
  body: string,
  signature: string,
  secrets: string[],
): Stripe.Event {
  const stripe = getStripe();
  let last: unknown;
  for (const raw of secrets) {
    const secret = raw?.trim();
    if (!secret) continue;
    try {
      return stripe.webhooks.constructEvent(body, signature, secret);
    } catch (e) {
      last = e;
    }
  }
  if (last) throw last;
  throw new Error("No webhook signing secrets configured");
}

/** Platform account webhook (`/api/webhooks/stripe`). */
export function constructPlatformStripeWebhookEvent(
  body: string,
  signature: string,
): Stripe.Event {
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_TEST,
  ];
  return constructWithFirstMatchingSecret(body, signature, secrets);
}

/** Connect webhook (`/api/webhooks/stripe-connect`). */
export function constructConnectStripeWebhookEvent(
  body: string,
  signature: string,
): Stripe.Event {
  const secrets = [
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST,
  ];
  return constructWithFirstMatchingSecret(body, signature, secrets);
}
