import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tenant";
import {
  listSavedPaymentMethods,
  detachPaymentMethod,
} from "@/lib/stripe/payments";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();
    const methods = await listSavedPaymentMethods(session.user.id, tenant.id);
    return NextResponse.json(methods);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("GET /api/stripe/payment-methods error:", error);
    return NextResponse.json(
      { error: "Failed to list payment methods" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const { paymentMethodId } = (await request.json()) as {
      paymentMethodId: string;
    };

    if (!paymentMethodId) {
      return NextResponse.json(
        { error: "paymentMethodId is required" },
        { status: 400 },
      );
    }

    await detachPaymentMethod(session.user.id, tenant.id, paymentMethodId);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("DELETE /api/stripe/payment-methods error:", error);
    return NextResponse.json(
      { error: "Failed to remove payment method" },
      { status: 500 },
    );
  }
}
