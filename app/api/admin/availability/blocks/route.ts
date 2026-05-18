import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { notifyCoachOfAdminCreatedBlock } from "@/lib/availability-notifications";

// Admin-side block creation. Unlike `/api/coaches/availability` (which the
// coach calls for themselves and which can land in `pending_approval` for
// yellow/red zones), an admin-created block is always `active` immediately —
// the admin already has approval authority, so we record them as the
// approver on creation. The coach is notified via push so they aren't
// surprised next time they open their calendar.
export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireRole("ADMIN");
    const body = await request.json();

    const {
      coachUserId,
      type,
      dayOfWeek,
      startTime,
      endTime,
      startDate,
      endDate,
      isAllDay,
      reasonType,
      reasonNote,
    } = body as {
      coachUserId?: string;
      type?: "recurring" | "one_time";
      dayOfWeek?: number[];
      startTime?: string | null;
      endTime?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      isAllDay?: boolean;
      reasonType?: "vacation" | "personal" | "training" | "other";
      reasonNote?: string | null;
    };

    if (!coachUserId) {
      return NextResponse.json({ error: "coachUserId is required" }, { status: 400 });
    }
    if (type !== "recurring" && type !== "one_time") {
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
    }
    if (!reasonType) {
      return NextResponse.json({ error: "reasonType is required" }, { status: 400 });
    }
    if (type === "one_time" && (!startDate || !endDate)) {
      return NextResponse.json(
        { error: "startDate and endDate are required for one_time" },
        { status: 400 },
      );
    }
    if (
      type === "recurring" &&
      (!Array.isArray(dayOfWeek) || dayOfWeek.length === 0 || !startTime || !endTime)
    ) {
      return NextResponse.json(
        { error: "dayOfWeek, startTime and endTime are required for recurring" },
        { status: 400 },
      );
    }

    // Ensure the target coach belongs to this tenant (anti cross-tenant leak)
    // and has a coach profile here — we only allow blocking actual coaches.
    const coachProfile = await prisma.coachProfile.findFirst({
      where: { tenantId: tenant.id, userId: coachUserId },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!coachProfile || !coachProfile.user) {
      return NextResponse.json(
        { error: "Coach not found in this tenant" },
        { status: 404 },
      );
    }

    const now = new Date();
    const block = await prisma.coachAvailabilityBlock.create({
      data: {
        tenantId: tenant.id,
        coachId: coachProfile.userId!,
        type,
        dayOfWeek: dayOfWeek ?? [],
        startTime: startTime || null,
        endTime: endTime || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isAllDay: isAllDay ?? (!startTime && !endTime),
        reasonType,
        reasonNote: reasonNote || null,
        status: "active",
        approvedBy: session.user.id,
        approvedAt: now,
      },
    });

    // Notify the coach asynchronously. A failure here shouldn't fail the
    // creation — the block exists either way.
    notifyCoachOfAdminCreatedBlock({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      coachUserId: coachProfile.user.id,
      block: {
        id: block.id,
        type: block.type as "one_time" | "recurring",
        startDate: block.startDate,
        endDate: block.endDate,
        dayOfWeek: block.dayOfWeek,
        startTime: block.startTime,
        endTime: block.endTime,
        isAllDay: block.isAllDay,
        reasonType: block.reasonType,
        reasonNote: block.reasonNote,
      },
    }).catch((err) => {
      console.error("Failed to notify coach of admin-created block:", err);
    });

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create block";
    console.error("POST /api/admin/availability/blocks error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
