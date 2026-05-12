import { NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { listSaasPlansForTenant } from "@/lib/stripe/saas-plans";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");
    const plans = await listSaasPlansForTenant(tenant.id);
    return NextResponse.json({
      plans,
      stripeSandboxMode: tenant.stripeSandboxMode,
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
    console.error("GET /api/stripe/plans error:", error);
    return NextResponse.json(
      { error: "Failed to list plans" },
      { status: 500 },
    );
  }
}
