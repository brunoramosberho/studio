import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { listSavedPaymentMethods } from "@/lib/stripe/payments";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const memberId = request.nextUrl.searchParams.get("memberId");

    if (!memberId) {
      return NextResponse.json(
        { error: "memberId is required" },
        { status: 400 },
      );
    }

    const methods = await listSavedPaymentMethods(memberId, ctx.tenant.id);
    return NextResponse.json(methods);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (["Unauthorized", "Forbidden"].includes(message)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    console.error("GET /api/admin/pos/payment-methods error:", error);
    return NextResponse.json(
      { error: "Failed to list payment methods" },
      { status: 500 },
    );
  }
}
