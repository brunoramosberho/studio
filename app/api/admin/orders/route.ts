import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("FRONT_DESK");
    if (!hasPermission(ctx.membership.role, "orders")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = request.nextUrl;
    const studioId = url.searchParams.get("studioId");
    const status = url.searchParams.get("status");

    // Cap completed/cancelled orders to today's (local) bucket so the kitchen
    // view doesn't bloat with historical data while still letting bar staff
    // see what they've handed off so far this shift.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const where = {
      tenantId: ctx.tenant.id,
      ...(studioId ? { studioId } : {}),
      ...(status
        ? { status: status as never }
        : {
            OR: [
              { status: { in: ["PAID", "READY"] as const } },
              {
                status: { in: ["PICKED_UP", "CANCELLED"] as const },
                updatedAt: { gte: startOfToday },
              },
            ],
          }),
    };

    const orders = await prisma.bookingProductOrder.findMany({
      where,
      orderBy: { pickupAt: "asc" },
      include: {
        items: { select: { id: true, nameSnapshot: true, quantity: true } },
        user: { select: { id: true, name: true, email: true } },
        studio: { select: { id: true, name: true } },
        booking: {
          select: {
            id: true,
            class: {
              select: {
                startsAt: true,
                endsAt: true,
                classType: { select: { name: true } },
              },
            },
          },
        },
      },
      take: 200,
    });

    return NextResponse.json(orders);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
