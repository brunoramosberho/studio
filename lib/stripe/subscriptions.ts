import type Stripe from "stripe";
import { getStripe } from "./client";
import { toStripeAmount } from "./helpers";
import { prisma } from "@/lib/db";

/**
 * Create a recurring Stripe Price on the connected account.
 * Called when admin saves a SUBSCRIPTION package that doesn't have a stripePriceId yet.
 */
export async function ensureStripePrice(
  packageId: string,
  stripeAccountId: string,
): Promise<string> {
  const pkg = await prisma.package.findUniqueOrThrow({
    where: { id: packageId },
  });

  if (pkg.stripePriceId) return pkg.stripePriceId;

  const stripe = getStripe();

  const product = await stripe.products.create(
    {
      name: pkg.name,
      metadata: { packageId: pkg.id },
    },
    { stripeAccount: stripeAccountId },
  );

  const interval = pkg.recurringInterval === "year" ? "year" : "month";

  const price = await stripe.prices.create(
    {
      product: product.id,
      unit_amount: toStripeAmount(pkg.price),
      currency: pkg.currency.toLowerCase(),
      recurring: { interval },
      metadata: { packageId: pkg.id },
    },
    { stripeAccount: stripeAccountId },
  );

  await prisma.package.update({
    where: { id: packageId },
    data: { stripePriceId: price.id },
  });

  return price.id;
}

/**
 * Create a Stripe Subscription on the connected account for a member.
 */
export async function createMemberSubscription({
  tenantId,
  userId,
  packageId,
  paymentMethodId,
}: {
  tenantId: string;
  userId: string;
  packageId: string;
  paymentMethodId?: string;
}): Promise<Stripe.Subscription> {
  const stripe = getStripe();

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });
  if (!tenant.stripeAccountId) {
    throw new Error("Studio has no connected Stripe account");
  }

  const stripeCustomer = await getOrCreateStripeCustomer(
    userId,
    tenantId,
    tenant.stripeAccountId,
  );

  const stripePriceId = await ensureStripePrice(
    packageId,
    tenant.stripeAccountId,
  );

  const subParams: Stripe.SubscriptionCreateParams = {
    customer: stripeCustomer.stripeCustomerId,
    items: [{ price: stripePriceId }],
    application_fee_percent: tenant.applicationFeePercent || undefined,
    payment_behavior: "default_incomplete",
    payment_settings: {
      payment_method_types: ["card"],
      save_default_payment_method: "on_subscription",
    },
    expand: ["latest_invoice.confirmation_secret"],
    metadata: { tenantId, userId, packageId },
  };

  if (paymentMethodId) {
    subParams.default_payment_method = paymentMethodId;
    subParams.payment_behavior = "error_if_incomplete";
  }

  const subscription = await stripe.subscriptions.create(subParams, {
    stripeAccount: tenant.stripeAccountId,
  });

  await prisma.memberSubscription.create({
    data: {
      tenantId,
      userId,
      packageId,
      stripeSubscriptionId: subscription.id,
      stripePriceId,
      status: subscription.status,
      currentPeriodStart: new Date(((subscription as unknown as Record<string, number>).current_period_start ?? Date.now() / 1000) * 1000),
      currentPeriodEnd: new Date(((subscription as unknown as Record<string, number>).current_period_end ?? Date.now() / 1000) * 1000),
    },
  });

  return subscription;
}

/**
 * Cancel a member's subscription (at period end by default).
 */
export async function cancelMemberSubscription(
  subscriptionId: string,
  immediately = false,
) {
  const memberSub = await prisma.memberSubscription.findUniqueOrThrow({
    where: { stripeSubscriptionId: subscriptionId },
    include: { tenant: true },
  });

  if (!memberSub.tenant.stripeAccountId) {
    throw new Error("No connected account");
  }

  const stripe = getStripe();

  if (immediately) {
    await stripe.subscriptions.cancel(subscriptionId, {
      stripeAccount: memberSub.tenant.stripeAccountId,
    });
    await prisma.memberSubscription.update({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: "canceled", canceledAt: new Date() },
    });
  } else {
    await stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: true },
      { stripeAccount: memberSub.tenant.stripeAccountId },
    );
    await prisma.memberSubscription.update({
      where: { stripeSubscriptionId: subscriptionId },
      data: { cancelAtPeriodEnd: true },
    });
  }
}

/**
 * Reactivate a subscription that was set to cancel at period end.
 * This simply removes the cancellation — no new charge since the period is already paid.
 */
export async function reactivateMemberSubscription(subscriptionId: string) {
  const memberSub = await prisma.memberSubscription.findUniqueOrThrow({
    where: { stripeSubscriptionId: subscriptionId },
    include: { tenant: true },
  });

  if (!memberSub.tenant.stripeAccountId) {
    throw new Error("No connected account");
  }

  if (memberSub.status === "canceled") {
    throw new Error("Cannot reactivate a fully canceled subscription");
  }

  const stripe = getStripe();

  await stripe.subscriptions.update(
    subscriptionId,
    { cancel_at_period_end: false },
    { stripeAccount: memberSub.tenant.stripeAccountId },
  );

  await prisma.memberSubscription.update({
    where: { stripeSubscriptionId: subscriptionId },
    data: { cancelAtPeriodEnd: false },
  });
}

/**
 * Admin: pause collection on a member's subscription.
 */
export async function pauseSubscription(
  subscriptionId: string,
  resumesAt?: Date,
) {
  const memberSub = await prisma.memberSubscription.findUniqueOrThrow({
    where: { stripeSubscriptionId: subscriptionId },
    include: { tenant: true },
  });

  if (!memberSub.tenant.stripeAccountId) {
    throw new Error("No connected account");
  }

  const stripe = getStripe();

  await stripe.subscriptions.update(
    subscriptionId,
    {
      pause_collection: {
        behavior: "void",
        ...(resumesAt && {
          resumes_at: Math.floor(resumesAt.getTime() / 1000),
        }),
      },
    },
    { stripeAccount: memberSub.tenant.stripeAccountId },
  );

  await prisma.memberSubscription.update({
    where: { stripeSubscriptionId: subscriptionId },
    data: {
      status: "paused",
      pausedAt: new Date(),
      resumesAt: resumesAt ?? null,
    },
  });
}

/**
 * Admin: resume a paused subscription.
 */
export async function resumeSubscription(subscriptionId: string) {
  const memberSub = await prisma.memberSubscription.findUniqueOrThrow({
    where: { stripeSubscriptionId: subscriptionId },
    include: { tenant: true },
  });

  if (!memberSub.tenant.stripeAccountId) {
    throw new Error("No connected account");
  }

  const stripe = getStripe();

  await stripe.subscriptions.update(
    subscriptionId,
    { pause_collection: "" as unknown as Stripe.SubscriptionUpdateParams.PauseCollection },
    { stripeAccount: memberSub.tenant.stripeAccountId },
  );

  await prisma.memberSubscription.update({
    where: { stripeSubscriptionId: subscriptionId },
    data: {
      status: "active",
      pausedAt: null,
      resumesAt: null,
    },
  });
}

async function getOrCreateStripeCustomer(
  userId: string,
  tenantId: string,
  stripeAccountId: string,
) {
  const existing = await prisma.stripeCustomer.findUnique({
    where: { tenantId_memberId: { tenantId, memberId: userId } },
  });
  if (existing) return existing;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
  });

  const stripe = getStripe();
  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: user.name ?? undefined,
      metadata: { memberId: userId, tenantId },
    },
    { stripeAccount: stripeAccountId },
  );

  return prisma.stripeCustomer.create({
    data: {
      tenantId,
      memberId: userId,
      stripeCustomerId: customer.id,
    },
  });
}
