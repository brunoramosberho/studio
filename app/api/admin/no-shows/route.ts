import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

/**
 * GET /api/admin/no-shows
 * List pending no-show penalties for review. Optional `status` query param
 * filters by status (default: pending). Returns rows sorted newest-first.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("FRONT_DESK");

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") ?? "pending";
    const allowed = ["pending", "confirmed", "waived", "reverted"] as const;
    type Status = (typeof allowed)[number];
    const status: Status = (allowed as readonly string[]).includes(statusParam)
      ? (statusParam as Status)
      : "pending";

    const rows = await prisma.pendingPenalty.findMany({
      where: { tenantId: ctx.tenant.id, status },
      orderBy: { createdAt: "desc" },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            creditLost: true,
            guestName: true,
            guestEmail: true,
          },
        },
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      take: 500,
    });

    const classIds = Array.from(new Set(rows.map((r) => r.classId)));
    const classes = classIds.length
      ? await prisma.class.findMany({
          where: { id: { in: classIds }, tenantId: ctx.tenant.id },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            classType: { select: { name: true, color: true } },
            coach: { select: { name: true } },
          },
        })
      : [];
    const classMap = new Map(classes.map((c) => [c.id, c]));

    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        autoConfirmAt: r.autoConfirmAt,
        resolvedAt: r.resolvedAt,
        loseCredit: r.loseCredit,
        chargeFee: r.chargeFee,
        feeAmountCents: r.feeAmountCents,
        isUnlimited: r.isUnlimited,
        user: r.user
          ? { id: r.user.id, name: r.user.name, email: r.user.email, image: r.user.image }
          : r.booking.guestName
            ? { id: null, name: r.booking.guestName, email: r.booking.guestEmail, image: null }
            : null,
        booking: { id: r.booking.id, status: r.booking.status },
        class: classMap.get(r.classId) ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/admin/no-shows error:", error);
    return NextResponse.json({ error: "Failed to load no-shows" }, { status: 500 });
  }
}
