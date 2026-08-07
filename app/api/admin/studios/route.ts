import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { resolveScheduleTimezone } from "@/lib/schedule/visibility";

// Lightweight studios list used by the admin availability form.
// Returns id + name + timezone, sorted alphabetically. The timezone lets
// day-scoped screens (check-in) anchor "today" to the studio's wall clock
// instead of the browser's.
export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK");
    const [rows, fallbackTz] = await Promise.all([
      prisma.studio.findMany({
        where: { tenantId: tenant.id, isActive: true },
        select: { id: true, name: true, city: { select: { timezone: true } } },
        orderBy: { name: "asc" },
      }),
      resolveScheduleTimezone(tenant),
    ]);
    const studios = rows.map((s) => ({
      id: s.id,
      name: s.name,
      timezone: s.city?.timezone || fallbackTz,
    }));
    return NextResponse.json({ studios });
  } catch (error) {
    console.error("GET /api/admin/studios error:", error);
    return NextResponse.json(
      { error: "Failed to fetch studios" },
      { status: 500 },
    );
  }
}
