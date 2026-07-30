import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";

// Row divisions for the admin schedule grid. Read by anyone who can see the
// schedule (front desk included) so the grid renders identically for every
// role; editing them stays ADMIN-only via the settings endpoint.
export async function GET() {
  try {
    const ctx = await requirePermission("schedule");
    const { tenant } = ctx;
    return NextResponse.json({
      scheduleSlotTimes: tenant.scheduleSlotTimes ?? [],
      openHour: parseInt((tenant.studioOpenTime || "06:00").split(":")[0] ?? "6", 10),
      closeHour: parseInt((tenant.studioCloseTime || "22:00").split(":")[0] ?? "22", 10),
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/admin/schedule/grid-config error:", error);
    return NextResponse.json({ error: "Failed to load grid config" }, { status: 500 });
  }
}
