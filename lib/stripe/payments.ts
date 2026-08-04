import type Stripe from "stripe";
import { toStripeAmount, fromStripeAmount, calculateFee } from "./helpers";
import { prisma } from "@/lib/db";
import { getTenantStripeContext } from "./tenant-stripe";
import {
  getOrCreateStripeCustomer,
  isApplicationFeeUnsupportedError,
  getOrAdoptStripeCustomer,
  isMissingCustomerError,
  refreshStaleStripeCustomer,
} from "./customers";

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

  let stripeCustomer = await getOrCreateStripeCustomer(
    memberId,
    tenantId,
    tenant.stripeAccountId,
    stripe,
  );

  // Stripe only sends a receipt email when receipt_email is set on the PI
  // (or when explicitly enabled at account level). Pulling the buyer's
  // current email here covers the guest checkout case where the customer
  // record on Stripe might still have a stale email.
  const member = await prisma.user.findUnique({
    where: { id: memberId },
    select: { email: true },
  });

  const feeAmount = calculateFee(
    amountInCurrency,
    tenant.applicationFeePercent,
  );

  // `withFee: false` retries the charge without our cut — see the catch below.
  const buildPiParams = (
    opts: { withFee?: boolean } = {},
  ): Stripe.PaymentIntentCreateParams => ({
    amount: toStripeAmount(amountInCurrency),
    currency: chargeCurrency,
    customer: stripeCustomer.stripeCustomerId,
    description,
    application_fee_amount:
      opts.withFee === false || feeAmount <= 0 ? undefined : feeAmount,
    setup_future_usage: "off_session",
    receipt_email: member?.email ?? undefined,
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
  });

  // Set when Stripe refused our cut and we charged without it, so the stored
  // row reflects what was actually taken rather than what we asked for.
  let feeWaived = false;

  /**
   * Create the intent, dropping our application fee if Stripe won't allow it
   * for this platform/studio country pair — a Spanish platform with a Mexican
   * studio is one it rejects outright. Charging without the fee costs us the
   * commission; refusing costs the studio the sale and leaves the member
   * looking at "we couldn't process your payment". Take the sale.
   */
  const createIntent = async (): Promise<Stripe.PaymentIntent> => {
    try {
      return await stripe.paymentIntents.create(buildPiParams(), {
        stripeAccount: tenant.stripeAccountId!,
      });
    } catch (err) {
      if (!isApplicationFeeUnsupportedError(err)) throw err;
      console.warn(
        `[stripe] application fee unsupported for tenant ${tenantId}; charging without it`,
      );
      feeWaived = true;
      return stripe.paymentIntents.create(buildPiParams({ withFee: false }), {
        stripeAccount: tenant.stripeAccountId!,
      });
    }
  };

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await createIntent();
  } catch (err) {
    // Self-heal: the stored customer may have been deleted on the studio's
    // dashboard or created before a sandbox→live flip. Re-resolve (adoption
    // included) and retry exactly once — through createIntent, so a stale
    // customer and an unsupported fee can both be recovered in one attempt.
    if (!isMissingCustomerError(err)) throw err;
    stripeCustomer = await refreshStaleStripeCustomer(
      memberId,
      tenantId,
      tenant.stripeAccountId,
      stripe,
    );
    paymentIntent = await createIntent();
  }

  await prisma.stripePayment.create({
    data: {
      tenantId,
      memberId,
      stripePaymentIntentId: paymentIntent.id,
      amount: amountInCurrency,
      // Mirror the actual charge currency — omitting it fell back to the
      // schema default "eur", mislabeling every MXN tenant's payments.
      currency: chargeCurrency,
      applicationFee:
        feeWaived || feeAmount <= 0 ? null : fromStripeAmount(feeAmount),
      status: paymentMethodId && paymentIntent.status === "succeeded"
        ? "succeeded"
        : "pending",
      type,
      referenceId,
      concept,
    },
  });

  // Remember the last-used method so the next checkout auto-selects it.
  // Best-effort: never block the payment on this DB write.
  if (paymentMethodId && paymentIntent.status === "succeeded") {
    prisma.stripeCustomer
      .update({
        where: { tenantId_memberId: { tenantId, memberId } },
        data: { defaultPaymentMethodId: paymentMethodId },
      })
      .catch((err) => {
        console.error("Failed to persist defaultPaymentMethodId:", err);
      });
  }

  return paymentIntent;
}

export async function listSavedPaymentMethods(
  memberId: string,
  tenantId: string,
) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });
  if (!tenant.stripeAccountId) return [];

  const { stripe } = await getTenantStripeContext(tenantId);

  // Adopt-aware: a member migrated from the studio's previous platform may
  // already have a customer (with cards) on this same Stripe account — the
  // first look at their saved methods links it by verified email.
  let stripeCustomer = await getOrAdoptStripeCustomer(
    memberId,
    tenantId,
    tenant.stripeAccountId,
    stripe,
  );
  if (!stripeCustomer) return [];
  let methods: Stripe.ApiList<Stripe.PaymentMethod>;
  try {
    methods = await stripe.paymentMethods.list(
      { customer: stripeCustomer.stripeCustomerId, type: "card" },
      { stripeAccount: tenant.stripeAccountId },
    );
  } catch (err) {
    if (!isMissingCustomerError(err)) throw err;
    stripeCustomer = await refreshStaleStripeCustomer(
      memberId,
      tenantId,
      tenant.stripeAccountId,
      stripe,
    );
    methods = await stripe.paymentMethods.list(
      { customer: stripeCustomer.stripeCustomerId, type: "card" },
      { stripeAccount: tenant.stripeAccountId },
    );
  }

  // Surface the last-used card first so checkouts auto-select it. If the
  // stored default was detached we silently fall back to Stripe's order.
  const defaultId = stripeCustomer.defaultPaymentMethodId;
  const ordered = defaultId
    ? [...methods.data].sort((a, b) => {
        if (a.id === defaultId) return -1;
        if (b.id === defaultId) return 1;
        return 0;
      })
    : methods.data;

  return ordered.map((pm) => ({
    id: pm.id,
    brand: pm.card?.brand ?? "unknown",
    last4: pm.card?.last4 ?? "****",
    expMonth: pm.card?.exp_month ?? 0,
    expYear: pm.card?.exp_year ?? 0,
    isDefault: pm.id === defaultId,
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

  let stripeCustomer = await getOrCreateStripeCustomer(
    memberId,
    tenantId,
    tenant.stripeAccountId,
    stripe,
  );

  let setupIntent: Stripe.SetupIntent;
  try {
    setupIntent = await stripe.setupIntents.create(
      {
        customer: stripeCustomer.stripeCustomerId,
        payment_method_types: ["card"],
      },
      { stripeAccount: tenant.stripeAccountId },
    );
  } catch (err) {
    if (!isMissingCustomerError(err)) throw err;
    stripeCustomer = await refreshStaleStripeCustomer(
      memberId,
      tenantId,
      tenant.stripeAccountId,
      stripe,
    );
    setupIntent = await stripe.setupIntents.create(
      {
        customer: stripeCustomer.stripeCustomerId,
        payment_method_types: ["card"],
      },
      { stripeAccount: tenant.stripeAccountId },
    );
  }

  return {
    clientSecret: setupIntent.client_secret!,
    stripeAccountId: tenant.stripeAccountId,
  };
}


