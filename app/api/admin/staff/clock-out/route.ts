import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { clockOut, ClockError } from "@/lib/staff";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("FRONT_DESK");

    const body = await request.json();
    const { latitude, longitude, accuracy, notes } = body ?? {};

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json(
        { error: "latitude and longitude required" },
        { status: 400 },
      );
    }

    const result = await clockOut({
      tenantId: ctx.tenant.id,
      userId: ctx.session.user!.id!,
      point: { latitude, longitude },
      accuracy: typeof accuracy === "number" ? accuracy : null,
      notes: typeof notes === "string" ? notes : null,
    });

    return NextResponse.json({
      shift: result.shift,
      durationMinutes: result.durationMinutes,
    });
  } catch (error) {
    if (error instanceof ClockError) {
      const status = error.code === "NO_OPEN_SHIFT" ? 404 : 400;
      return NextResponse.json(
        { error: error.message, code: error.code, ...(error.meta ?? {}) },
        { status },
      );
    }
    console.error("POST /api/admin/staff/clock-out error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
