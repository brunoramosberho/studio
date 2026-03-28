import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();

    const entries = await prisma.waitlist.findMany({
      where: {
        tenantId: tenant.id,
        userId: session.user.id,
        class: { startsAt: { gt: new Date() }, status: "SCHEDULED" },
      },
      include: {
        class: {
          include: {
            classType: true,
            coach: { include: { user: { select: { name: true, image: true } } } },
            room: { include: { studio: { select: { name: true } } } },
            _count: {
              select: {
                bookings: { where: { status: "CONFIRMED" } },
                waitlist: true,
              },
            },
          },
        },
      },
      orderBy: { class: { startsAt: "asc" } },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("GET /api/waitlist/my error:", error);
    return NextResponse.json(
      { error: "Failed to fetch your waitlist" },
      { status: 500 },
    );
  }
}
