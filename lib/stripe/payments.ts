import type Stripe from "stripe";
import { getStripeForCountry } from "./client";
import { toStripeAmount, fromStripeAmount, calculateFee } from "./helpers";
import { resolveTenantCurrency } from "@/lib/currency";
import { prisma } from "@/lib/db";

export interface CreateMemberPaymentParams {
  tenantId: string;
  memberId: string;
  amountInCurrency: number;
  type: "class" | "membership" | "product" | "pos";
  referenceId?: string;
  description?: string;
  paymentMethodId?: string;
  concept?: string;
  /**
   * ISO 4217 currency code. When omitted we fall back to the tenant's
   * defaultCountry currency (so a Mexican studio charges in MXN, a Spanish
   * studio in EUR…). Pass this explicitly when the caller knows the source
   * (e.g. a Package row) — it avoids an extra DB hit and guarantees the
   * Stripe charge matches what the user saw.
   */
  currency?: string;
}

/**
 * Resolve the platform Stripe instance + currency for a tenant in a single
 * round-trip. Centralised here so every Stripe call site uses the same logic.
 */
async function getTenantStripeContext(
  tenantId: string,
): Promise<{ stripe: Stripe; currency: string; countryCode: string | null }> {
  const cfg = await resolveTenantCurrency(tenantId);
  return {
    stripe: getStripeForCountry(cfg.countryCode),
    currency: cfg.code.toLowerCase(),
    countryCode: cfg.countryCode,
  };
}

/**
 * Creates a PaymentIntent on the studio's Connected Account, with an
 * application_fee directed to the platform (Magic Payments — entity is picked
 * automatically based on the tenant's country).
 * Returns the PaymentIntent so the frontend can use its clientSecret.
 */
export async function createMemberPayment({
  tenantId,
  memberId,
  amountInCurrency,
  type,
  referenceId,
  description,
  paymentMethodId,
  concept,
  currency,
}: CreateMemberPaymentParams): Promise<Stripe.PaymentIntent> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });

  if (!tenant.stripeAccountId) {
    throw new Error("Studio has no connected Stripe account");
  }

  const { stripe, currency: tenantCurrency } = await getTenantStripeContext(tenantId);
  const chargeCurrency = (currency ?? tenantCurrency).toLowerCase();

  const stripeCustomer = await getOrCreateStripeCustomer(
    memberId,
    tenantId,
    tenant.stripeAccountId,
    stripe,
  );

  const feeAmount = calculateFee(
    amountInCurrency,
    tenant.applicationFeePercent,
  );

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: toStripeAmount(amountInCurrency),
      currency: chargeCurrency,
      customer: stripeCustomer.stripeCustomerId,
      description,
      application_fee_amount: feeAmount > 0 ? feeAmount : undefined,
      setup_future_usage: "off_session",
      metadata: {
        tenantId,
        memberId,
        type,
        referenceId: referenceId ?? "",
      },
      payment_method_types: ["card"],
      ...(paymentMethodId && {
        payment_method: paymentMethodId,
        confirm: true,
      }),
    },
    { stripeAccount: tenant.stripeAccountId },
  );

  await prisma.stripePayment.create({
    data: {
      tenantId,
      memberId,
      stripePaymentIntentId: paymentIntent.id,
      amount: amountInCurrency,
      applicationFee: feeAmount > 0 ? fromStripeAmount(feeAmount) : null,
      status: paymentMethodId && paymentIntent.status === "succeeded"
        ? "succeeded"
        : "pending",
      type,
      referenceId,
      concept,
    },
  });

  return paymentIntent;
}

export async function listSavedPaymentMethods(
  memberId: string,
  tenantId: string,
) {
  const stripeCustomer = await prisma.stripeCustomer.findUnique({
    where: { tenantId_memberId: { tenantId, memberId } },
  });
  if (!stripeCustomer) return [];

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });
  if (!tenant.stripeAccountId) return [];

  const { stripe } = await getTenantStripeContext(tenantId);
  const methods = await stripe.paymentMethods.list(
    { customer: stripeCustomer.stripeCustomerId, type: "card" },
    { stripeAccount: tenant.stripeAccountId },
  );

  return methods.data.map((pm) => ({
    id: pm.id,
    brand: pm.card?.brand ?? "unknown",
    last4: pm.card?.last4 ?? "****",
    expMonth: pm.card?.exp_month ?? 0,
    expYear: pm.card?.exp_year ?? 0,
  }));
}

export async function detachPaymentMethod(
  memberId: string,
  tenantId: string,
  paymentMethodId: string,
) {
  const stripeCustomer = await prisma.stripeCustomer.findUnique({
    where: { tenantId_memberId: { tenantId, memberId } },
  });
  if (!stripeCustomer) throw new Error("Customer not found");

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });
  if (!tenant.stripeAccountId) throw new Error("No connected account");

  const { stripe } = await getTenantStripeContext(tenantId);

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId, {
    stripeAccount: tenant.stripeAccountId,
  });
  if (pm.customer !== stripeCustomer.stripeCustomerId) {
    throw new Error("Payment method does not belong to this customer");
  }

  await stripe.paymentMethods.detach(paymentMethodId, {
    stripeAccount: tenant.stripeAccountId,
  });
}

export async function createSetupIntent(
  memberId: string,
  tenantId: string,
) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });
  if (!tenant.stripeAccountId) {
    throw new Error("Studio has no connected Stripe account");
  }

  const { stripe } = await getTenantStripeContext(tenantId);

  const stripeCustomer = await getOrCreateStripeCustomer(
    memberId,
    tenantId,
    tenant.stripeAccountId,
    stripe,
  );

  const setupIntent = await stripe.setupIntents.create(
    {
      customer: stripeCustomer.stripeCustomerId,
      payment_method_types: ["card"],
    },
    { stripeAccount: tenant.stripeAccountId },
  );

  return {
    clientSecret: setupIntent.client_secret!,
    stripeAccountId: tenant.stripeAccountId,
  };
}

async function getOrCreateStripeCustomer(
  memberId: string,
  tenantId: string,
  stripeAccountId: string,
  stripe: Stripe,
) {
  const existing = await prisma.stripeCustomer.findUnique({
    where: { tenantId_memberId: { tenantId, memberId } },
  });

  if (existing) return existing;

  const member = await prisma.user.findUniqueOrThrow({
    where: { id: memberId },
  });

  const customer = await stripe.customers.create(
    {
      email: member.email,
      name: member.name ?? undefined,
      metadata: { memberId, tenantId },
    },
    { stripeAccount: stripeAccountId },
  );

  return prisma.stripeCustomer.create({
    data: {
      tenantId,
      memberId,
      stripeCustomerId: customer.id,
    },
  });
}
