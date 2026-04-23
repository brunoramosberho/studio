import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { confirmPendingPenalty } from "@/lib/no-show-penalty";

/**
 * Auto-confirm pending no-show penalties whose grace window has elapsed. Runs
 * hourly. Skips penalties that the tenant has set a grace window of > 168h
 * (7 days) on — treated as "manual only" to respect conservative workflows.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const due = await prisma.pendingPenalty.findMany({
    where: {
      status: "pending",
      autoConfirmAt: { lte: now },
    },
    select: { id: true, tenantId: true },
    take: 500,
  });

  let confirmed = 0;
  let failed = 0;

  for (const row of due) {
    try {
      await confirmPendingPenalty({
        pendingId: row.id,
        resolvedBy: null,
        note: "Auto-confirmed after grace window",
      });
      confirmed++;
    } catch (err) {
      console.error("[no-show-auto-confirm]", row.id, err);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, confirmed, failed });
}
