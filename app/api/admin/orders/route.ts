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

    const orders = await prisma.bookingProductOrder.findMany({
      where: {
        tenantId: ctx.tenant.id,
        ...(studioId ? { studioId } : {}),
        ...(status
          ? { status: status as never }
          : { status: { in: ["PAID", "READY"] } }),
      },
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
