import { NextRequest, NextResponse } from "next/server";
import { tenantsAtLocalHour } from "@/lib/revenue/cron-dispatch";
import { runPackExpirationForTenant } from "@/lib/revenue/service";

// Runs hourly UTC. Fires per-tenant work when the tenant's local clock hits
// 01:xx. Expires packs past their periodEnd and emits expiration_breakage
// for any unconsumed credits. Idempotent via the unique index.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const tenants = await tenantsAtLocalHour(1, now);

  let totalExpired = 0;
  let totalBreakage = 0;
  const details: { tenantId: string; expired: number; breakage: number }[] = [];

  for (const ctx of tenants) {
    try {
      const { expired, breakageEmitted } = await runPackExpirationForTenant(
        ctx.tenantId,
        now,
      );
      totalExpired += expired;
      totalBreakage += breakageEmitted;
      details.push({ tenantId: ctx.tenantId, expired, breakage: breakageEmitted });
    } catch (err) {
      console.error("[revenue-pack-expiration]", ctx.tenantId, err);
    }
  }

  return NextResponse.json({
    ok: true,
    tenantsProcessed: tenants.length,
    totalExpired,
    totalBreakage,
    details,
  });
}
