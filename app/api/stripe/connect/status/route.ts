import { NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { getStripe } from "@/lib/stripe/client";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");

    if (!tenant.stripeAccountId) {
      return NextResponse.json({
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsCount: 0,
      });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(tenant.stripeAccountId);

    let status: "pending" | "active" | "restricted" = "pending";
    if (account.charges_enabled && account.payouts_enabled) {
      status = "active";
    } else if (
      account.requirements?.currently_due?.length ||
      account.requirements?.past_due?.length
    ) {
      status = "restricted";
    }

    return NextResponse.json({
      status,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      requirementsCount:
        (account.requirements?.currently_due?.length ?? 0) +
        (account.requirements?.past_due?.length ?? 0),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized" || message === "Forbidden") {
      return NextResponse.json(
        { error: message },
        { status: message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("GET /api/stripe/connect/status error:", error);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 },
    );
  }
}
