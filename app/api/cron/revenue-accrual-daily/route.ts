import { NextRequest, NextResponse } from "next/server";
import { tenantsAtLocalHour } from "@/lib/revenue/cron-dispatch";
import { runDailyAccrualForTenant } from "@/lib/revenue/service";

// Runs hourly UTC. Fires per-tenant work when the tenant's local clock hits
// 00:xx (midnight → recognize yesterday's accrual). Idempotent.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const tenants = await tenantsAtLocalHour(0, now);

  let totalAccrued = 0;
  const details: { tenantId: string; accrued: number }[] = [];

  for (const ctx of tenants) {
    // Target yesterday (local): subtract 1 day from the tenant's local date.
    const target = new Date(ctx.localDate);
    target.setUTCDate(target.getUTCDate() - 1);
    try {
      const { accrued } = await runDailyAccrualForTenant(ctx.tenantId, target);
      totalAccrued += accrued;
      details.push({ tenantId: ctx.tenantId, accrued });
    } catch (err) {
      console.error("[revenue-accrual-daily]", ctx.tenantId, err);
    }
  }

  return NextResponse.json({
    ok: true,
    tenantsProcessed: tenants.length,
    totalAccrued,
    details,
  });
}
