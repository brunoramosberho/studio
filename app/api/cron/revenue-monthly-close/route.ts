import { NextRequest, NextResponse } from "next/server";
import { tenantsAtMonthlyCloseHour } from "@/lib/revenue/cron-dispatch";
import { runMonthlyCloseForTenant } from "@/lib/revenue/service";

// Runs hourly UTC. Fires per-tenant work when the tenant's local clock hits
// day 1 02:xx — closes out the previous month's unlimited subscriptions.
//
// Re-run safe: the service deletes booking + monthly_breakage events for the
// month and re-emits them atomically per entitlement.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const tenants = await tenantsAtMonthlyCloseHour(2, now);

  const details: {
    tenantId: string;
    month: string;
    entitlementsProcessed: number;
    breakageEvents: number;
  }[] = [];

  for (const ctx of tenants) {
    // "Previous month" in the tenant's timezone: ctx.localDate is day 1 of
    // the new month at 00:00 local, so the previous month is (year, month-1).
    const y = ctx.localDate.getUTCFullYear();
    const m0 = ctx.localDate.getUTCMonth(); // 0-indexed; this is the new month
    const prevY = m0 === 0 ? y - 1 : y;
    const prevM = m0 === 0 ? 12 : m0; // 1-indexed month
    const month = `${prevY}-${String(prevM).padStart(2, "0")}`;

    try {
      const result = await runMonthlyCloseForTenant(ctx.tenantId, month);
      details.push({
        tenantId: ctx.tenantId,
        month,
        entitlementsProcessed: result.entitlementsProcessed,
        breakageEvents: result.breakageEvents,
      });
    } catch (err) {
      console.error("[revenue-monthly-close]", ctx.tenantId, month, err);
    }
  }

  return NextResponse.json({
    ok: true,
    tenantsProcessed: tenants.length,
    details,
  });
}
