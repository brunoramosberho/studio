import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";
import { getStripeClientForTenantId } from "@/lib/stripe/tenant-stripe";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "mgic.app";

/**
 * Register the tenant's subdomain as a Payment Method Domain on the
 * tenant's Stripe Connect account. Needed for Apple Pay / Google Pay to
 * show up in the checkout — the platform-level Dashboard registration
 * does NOT apply to direct charges on connected accounts.
 *
 * Idempotent: ignores `payment_method_domain_already_exists`.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        name: true,
        stripeAccountId: true,
        stripeSandboxMode: true,
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    if (!tenant.stripeAccountId) {
      return NextResponse.json(
        { error: "Tenant has no Stripe Connect account" },
        { status: 400 },
      );
    }

    const domain = `${tenant.slug}.${ROOT_DOMAIN}`;
    const stripe = await getStripeClientForTenantId(tenant.id);

    try {
      const result = await stripe.paymentMethodDomains.create(
        { domain_name: domain },
        { stripeAccount: tenant.stripeAccountId },
      );
      return NextResponse.json({
        ok: true,
        created: true,
        domain,
        connectedAccount: tenant.stripeAccountId,
        sandbox: tenant.stripeSandboxMode,
        statuses: {
          applePay: result.apple_pay?.status ?? "unknown",
          googlePay: result.google_pay?.status ?? "unknown",
          link: result.link?.status ?? "unknown",
        },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message =
        (err as { message?: string }).message ?? "Stripe API error";
      if (code === "payment_method_domain_already_exists") {
        return NextResponse.json({
          ok: true,
          created: false,
          alreadyExists: true,
          domain,
          connectedAccount: tenant.stripeAccountId,
        });
      }
      return NextResponse.json(
        { error: message, code: code ?? null },
        { status: 502 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("register-apple-pay-domain error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
