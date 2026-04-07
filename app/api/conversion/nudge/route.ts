import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tenant";
import { getNudgeDecision } from "@/lib/conversion/nudge-engine";

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000; // 60s

export async function GET(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;
    const tenantId = tenant.id;

    const context = (request.nextUrl.searchParams.get("context") ??
      "booking") as "booking" | "post_booking" | "email_check";

    const cacheKey = `${userId}:${tenantId}:${context}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const decision = await getNudgeDecision(userId, tenantId, context);

    cache.set(cacheKey, { data: decision, ts: Date.now() });

    return NextResponse.json(decision);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized" || message === "Tenant not found") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("GET /api/conversion/nudge error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
