import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { updateLifecycle } from "@/lib/referrals/lifecycle";
import { getMemberWaiverStatus } from "@/lib/waiver/status";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { classId } = await params;
    const { memberId, method = "manual", force = false } = await request.json();

    if (!memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      select: { id: true, startsAt: true, endsAt: true },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const existing = await prisma.checkIn.findUnique({
      where: { classId_memberId: { classId, memberId } },
    });
    if (existing) {
      return NextResponse.json({ error: "Already checked in" }, { status: 409 });
    }

    if (!force) {
      const waiverResult = await getMemberWaiverStatus(memberId, ctx.tenant.id);
      if (waiverResult.blockCheckin && waiverResult.status !== "signed") {
        return NextResponse.json(
          { error: "waiver_pending", message: "El miembro no ha firmado el waiver" },
          { status: 403 },
        );
      }
    }

    const now = new Date();
    const status = now > cls.startsAt ? "late" : "present";

    const checkIn = await prisma.checkIn.create({
      data: {
        tenantId: ctx.tenant.id,
        classId,
        memberId,
        checkedInBy: ctx.session.user.id,
        method: method as "manual" | "qr" | "name",
        status: status as "present" | "late",
      },
    });

    // Sync: also mark booking as ATTENDED
    prisma.booking.updateMany({
      where: {
        classId,
        userId: memberId,
        tenantId: ctx.tenant.id,
        status: { in: ["CONFIRMED", "NO_SHOW"] },
      },
      data: { status: "ATTENDED" },
    }).catch((err) => console.error("Check-in booking sync failed:", err));

    updateLifecycle(memberId, ctx.tenant.id, "attended").catch(
      (err) => console.error("Lifecycle update (attended) failed:", err),
    );

    return NextResponse.json(checkIn, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/check-in error:", error);
    return NextResponse.json({ error: "Failed to check in" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { classId } = await params;
    const { memberId } = await request.json();

    if (!memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const deleted = await prisma.checkIn.deleteMany({
      where: { classId, memberId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Check-in not found" }, { status: 404 });
    }

    // Sync: revert booking back to CONFIRMED
    prisma.booking.updateMany({
      where: {
        classId,
        userId: memberId,
        tenantId: ctx.tenant.id,
        status: "ATTENDED",
      },
      data: { status: "CONFIRMED" },
    }).catch((err) => console.error("Undo check-in booking sync failed:", err));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("DELETE /api/check-in error:", error);
    return NextResponse.json({ error: "Failed to undo check-in" }, { status: 500 });
  }
}
