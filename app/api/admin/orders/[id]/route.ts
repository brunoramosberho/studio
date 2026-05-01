import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import type { BookingProductOrderStatus } from "@prisma/client";

const ALLOWED_TRANSITIONS: Record<BookingProductOrderStatus, BookingProductOrderStatus[]> = {
  PENDING_PAYMENT: ["CANCELLED"],
  PAID: ["READY", "PICKED_UP", "CANCELLED"],
  READY: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: [],
  CANCELLED: [],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("FRONT_DESK");
    if (!hasPermission(ctx.membership.role, "orders")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const next = body?.status as BookingProductOrderStatus | undefined;
    if (!next) {
      return NextResponse.json({ error: "Missing status" }, { status: 400 });
    }

    const order = await prisma.bookingProductOrder.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(next)) {
      return NextResponse.json(
        { error: `Cannot transition from ${order.status} to ${next}` },
        { status: 400 },
      );
    }

    const now = new Date();
    const updated = await prisma.bookingProductOrder.update({
      where: { id },
      data: {
        status: next,
        ...(next === "READY" && !order.readyAt ? { readyAt: now } : {}),
        ...(next === "PICKED_UP"
          ? {
              pickedUpAt: now,
              ...(order.readyAt ? {} : { readyAt: now }),
            }
          : {}),
        ...(next === "CANCELLED" ? { cancelledAt: now } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
