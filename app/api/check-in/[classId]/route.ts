import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { updateLifecycle } from "@/lib/referrals/lifecycle";
import { getMemberWaiverStatus } from "@/lib/waiver/status";
import { reconcileCreditOnLateAttendance } from "@/lib/credits";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { classId } = await params;
    const { memberId, bookingId, method = "manual", force = false } = await request.json();

    if (!memberId && !bookingId) {
      return NextResponse.json({ error: "memberId or bookingId is required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      select: { id: true, startsAt: true, endsAt: true },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Guest check-in: guests have no User account (and thus no CheckIn row),
    // so their attendance is tracked directly on the booking status.
    if (bookingId && !memberId) {
      const updated = await prisma.booking.updateMany({
        where: {
          id: bookingId,
          classId,
          tenantId: ctx.tenant.id,
          userId: null,
          status: { in: ["CONFIRMED", "NO_SHOW"] },
        },
        data: { status: "ATTENDED" },
      });
      if (updated.count === 0) {
        return NextResponse.json({ error: "Guest booking not found" }, { status: 404 });
      }
      return NextResponse.json({ guest: true, bookingId, status: "present" }, { status: 201 });
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

    // Sync: mark the booking ATTENDED. If we're correcting a no-show (the member
    // turned up after being marked absent), also revert any queued penalty and
    // restore a credit that was forfeited — otherwise an attendee would still be
    // penalised when the pending penalty auto-confirms.
    (async () => {
      const bk = await prisma.booking.findFirst({
        where: {
          classId,
          userId: memberId,
          tenantId: ctx.tenant.id,
          status: { in: ["CONFIRMED", "NO_SHOW"] },
        },
        include: { class: { select: { classTypeId: true } } },
      });
      if (!bk) return;
      await prisma.booking.update({
        where: { id: bk.id },
        data: { status: "ATTENDED" },
      });
      if (bk.status !== "NO_SHOW") return;
      // Waive the pending FEE (they came, so no penalty)...
      const pending = await prisma.pendingPenalty.findUnique({
        where: { bookingId: bk.id },
      });
      if (pending && pending.status === "pending") {
        await prisma.pendingPenalty.update({
          where: { id: pending.id },
          data: {
            status: "reverted",
            resolvedAt: new Date(),
            resolvedBy: ctx.session.user.id,
            resolutionNote: "Reverted: member checked in",
          },
        });
      }
      // ...but the class credit stays consumed — they attended, so it pays for
      // the class (re-consumed if a lenient no-show had refunded it).
      await reconcileCreditOnLateAttendance({
        bookingId: bk.id,
        packageUsed: bk.packageUsed,
        creditLost: bk.creditLost,
        classTypeId: bk.class.classTypeId,
      });
    })().catch((err) => console.error("Check-in booking sync failed:", err));

    updateLifecycle(memberId, ctx.tenant.id, "attended").catch(
      (err) => console.error("Lifecycle update (attended) failed:", err),
    );

    // If this member came via Wellhub, mirror the check-in there so payment
    // triggers (Automated Trigger requirement). No-op for direct members.
    let wellhubValidation: { validated: boolean; reason?: string } | null = null;
    try {
      const { validateWellhubVisitForCheckin } = await import("@/lib/platforms/wellhub");
      wellhubValidation = await validateWellhubVisitForCheckin({
        tenantId: ctx.tenant.id,
        classId,
        memberId,
      });
    } catch (err) {
      console.error("Wellhub validate from check-in failed:", err);
    }

    return NextResponse.json({ ...checkIn, wellhubValidation }, { status: 201 });
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
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { classId } = await params;
    const { memberId, bookingId } = await request.json();

    if (!memberId && !bookingId) {
      return NextResponse.json({ error: "memberId or bookingId is required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Guest undo: revert the booking status (no CheckIn row exists for guests).
    if (bookingId && !memberId) {
      const reverted = await prisma.booking.updateMany({
        where: {
          id: bookingId,
          classId,
          tenantId: ctx.tenant.id,
          userId: null,
          status: "ATTENDED",
        },
        data: { status: "CONFIRMED" },
      });
      if (reverted.count === 0) {
        return NextResponse.json({ error: "Guest check-in not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
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
