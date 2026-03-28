import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");

    const waitlistEntries = await prisma.waitlist.findMany({
      where: {
        tenantId: tenant.id,
        class: { startsAt: { gt: new Date() }, status: "SCHEDULED" },
      },
      include: {
        user: { select: { name: true, email: true } },
        class: {
          include: {
            classType: { select: { name: true } },
            room: { select: { maxCapacity: true } },
            _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
          },
        },
      },
      orderBy: [{ class: { startsAt: "asc" } }, { position: "asc" }],
    });

    const grouped = new Map<
      string,
      {
        classId: string;
        className: string;
        classDate: string;
        startsAt: string;
        capacity: number;
        enrolled: number;
        waitlist: {
          id: string;
          position: number;
          userName: string;
          userEmail: string;
          createdAt: string;
        }[];
      }
    >();

    for (const entry of waitlistEntries) {
      const cls = entry.class;
      if (!grouped.has(cls.id)) {
        grouped.set(cls.id, {
          classId: cls.id,
          className: cls.classType.name,
          classDate: cls.startsAt.toISOString(),
          startsAt: cls.startsAt.toISOString(),
          capacity: cls.room.maxCapacity,
          enrolled: cls._count.bookings,
          waitlist: [],
        });
      }
      grouped.get(cls.id)!.waitlist.push({
        id: entry.id,
        position: entry.position,
        userName: entry.user.name ?? "Sin nombre",
        userEmail: entry.user.email,
        createdAt: entry.createdAt.toISOString(),
      });
    }

    return NextResponse.json(Array.from(grouped.values()));
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden"].includes(error.message)
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("GET /api/admin/waitlist error:", error);
    return NextResponse.json(
      { error: "Failed to fetch waitlist" },
      { status: 500 },
    );
  }
}
