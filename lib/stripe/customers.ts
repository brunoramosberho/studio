import Stripe from "stripe";
export {
  isApplicationFeeUnsupportedError,
  isMissingCustomerError,
} from "./errors";
import { prisma } from "@/lib/db";

/**
 * Resolution of a member's Stripe customer on the tenant's CONNECTED account.
 *
 * Studios migrating from another platform usually keep the same Stripe
 * account, so their clients' customers — with saved cards — already live
 * there. Before ever creating a fresh customer we try to ADOPT an existing
 * one matched by the member's (login-verified) email, so those cards surface
 * in Magic without being re-entered. Adoption happens at this single choke
 * point, which covers both the first checkout and the first time the app
 * lists saved payment methods.
 *
 * Adopted cards are only ever offered in visible checkout flows where the
 * member picks them — never charged silently off-session.
 */

/** Probe at most this many email matches for one that has a saved card. */
const ADOPTION_PROBE_LIMIT = 5;

async function findAdoptableCustomer(
  stripe: Stripe,
  stripeAccountId: string,
  email: string,
): Promise<{ id: string; defaultPm: string | null } | null> {
  // Stripe lists newest-first; email filter is an exact (case-insensitive) match.
  const { data } = await stripe.customers.list(
    { email, limit: 20 },
    { stripeAccount: stripeAccountId },
  );
  const candidates = data.filter((c) => !c.deleted);
  if (candidates.length === 0) return null;

  for (const c of candidates.slice(0, ADOPTION_PROBE_LIMIT)) {
    const pms = await stripe.paymentMethods.list(
      { customer: c.id, type: "card", limit: 1 },
      { stripeAccount: stripeAccountId },
    );
    if (pms.data.length > 0) {
      const invoiceDefault =
        typeof c.invoice_settings?.default_payment_method === "string"
          ? c.invoice_settings.default_payment_method
          : null;
      return { id: c.id, defaultPm: invoiceDefault ?? pms.data[0].id };
    }
  }
  // No candidate has a card — still adopt the newest so future saves land on
  // the studio's existing customer instead of forking a duplicate.
  return { id: candidates[0].id, defaultPm: null };
}

/**
 * The member's StripeCustomer row if it exists; otherwise try to adopt an
 * email-matched customer from the connected account. Never creates a brand
 * new Stripe customer — returns null when there's nothing to adopt (callers
 * that need one use getOrCreateStripeCustomer).
 */
export async function getOrAdoptStripeCustomer(
  memberId: string,
  tenantId: string,
  stripeAccountId: string,
  stripe: Stripe,
) {
  const existing = await prisma.stripeCustomer.findUnique({
    where: { tenantId_memberId: { tenantId, memberId } },
  });
  if (existing) return existing;

  const member = await prisma.user.findUnique({
    where: { id: memberId },
    select: { email: true },
  });
  if (!member?.email) return null;

  try {
    const adoptable = await findAdoptableCustomer(stripe, stripeAccountId, member.email);
    if (!adoptable) return null;
    return await createRowSafely(tenantId, memberId, adoptable.id, adoptable.defaultPm);
  } catch (err) {
    // Adoption is best-effort — a Stripe hiccup must never block checkout or
    // the payment-methods screen; the caller just proceeds without a row.
    console.error("[stripe] customer adoption failed:", err);
    return null;
  }
}

/** Adopt-or-create: the resolution used by charge/subscription flows. */
export async function getOrCreateStripeCustomer(
  memberId: string,
  tenantId: string,
  stripeAccountId: string,
  stripe: Stripe,
) {
  const adopted = await getOrAdoptStripeCustomer(memberId, tenantId, stripeAccountId, stripe);
  if (adopted) return adopted;

  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  const customer = await stripe.customers.create(
    {
      email: member.email,
      name: member.name ?? undefined,
      metadata: { memberId, tenantId },
    },
    { stripeAccount: stripeAccountId },
  );
  return createRowSafely(tenantId, memberId, customer.id, null);
}

/** Unique-constraint-safe insert: a concurrent first checkout may have won. */
async function createRowSafely(
  tenantId: string,
  memberId: string,
  stripeCustomerId: string,
  defaultPaymentMethodId: string | null,
) {
  try {
    return await prisma.stripeCustomer.create({
      data: { tenantId, memberId, stripeCustomerId, defaultPaymentMethodId },
    });
  } catch {
    const winner = await prisma.stripeCustomer.findUnique({
      where: { tenantId_memberId: { tenantId, memberId } },
    });
    if (winner) return winner;
    throw new Error("Failed to persist StripeCustomer");
  }
}

/**
 * True when a Stripe call failed because the referenced customer no longer
 * exists (deleted on the dashboard, or created in the other live/test mode
 * before the studio flipped). Our StripeCustomer row is then stale.
 */
/**
 * Drop the stale row and resolve again (adopt-or-create). Used as a one-shot
 * retry when Stripe reports the stored customer doesn't exist — self-heals
 * rows left behind by dashboard cleanups or a sandbox→live flip.
 */
export async function refreshStaleStripeCustomer(
  memberId: string,
  tenantId: string,
  stripeAccountId: string,
  stripe: Stripe,
) {
  await prisma.stripeCustomer.deleteMany({ where: { tenantId, memberId } });
  return getOrCreateStripeCustomer(memberId, tenantId, stripeAccountId, stripe);
}
