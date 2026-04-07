import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tenant";
import { createMemberPayment } from "@/lib/stripe/payments";

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const body = await request.json();
    const { type, referenceId, amount, description } = body as {
      type: "class" | "membership" | "product" | "pos";
      referenceId?: string;
      amount: number;
      description?: string;
    };

    if (!type || !amount || amount <= 0) {
      return NextResponse.json(
        { error: "type and a positive amount are required" },
        { status: 400 },
      );
    }

    const paymentIntent = await createMemberPayment({
      tenantId: tenant.id,
      memberId: session.user.id,
      amountInCurrency: amount,
      type,
      referenceId,
      description,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      stripeAccountId: tenant.stripeAccountId,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message === "Studio has no connected Stripe account") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("POST /api/stripe/payment-intent error:", error);
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 },
    );
  }
}
