import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/tenant";
import { createSetupIntent } from "@/lib/stripe/payments";

export async function POST() {
  try {
    const { session, tenant } = await requireAuth();
    const result = await createSetupIntent(session.user.id, tenant.id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message === "Studio has no connected Stripe account") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("POST /api/stripe/setup-intent error:", error);
    return NextResponse.json(
      { error: "Failed to create setup intent" },
      { status: 500 },
    );
  }
}
