import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

/**
 * Public, tenant-scoped single-class endpoint for the embed widget.
 * Mirrors /api/embed/classes but returns one class with a bit more detail
 * (description, level, notes, coach bio). No session required.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await getTenant();
    if (!tenant) return cors({ error: "Tenant not found" }, 404);

    const { id } = await params;

    const cls = await prisma.class.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        classType: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            icon: true,
            level: true,
            duration: true,
            tags: true,
          },
        },
        room: {
          select: {
            id: true,
            name: true,
            maxCapacity: true,
            studio: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
        coach: {
          select: {
            id: true,
            userId: true,
            name: true,
            photoUrl: true,
            bio: true,
            specialties: true,
            user: { select: { name: true, image: true } },
          },
        },
        _count: {
          select: {
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            waitlist: true,
          },
        },
      },
    });

    if (!cls) return cors({ error: "Class not found" }, 404);

    const result = {
      id: cls.id,
      startsAt: cls.startsAt,
      endsAt: cls.endsAt,
      status: cls.status,
      tag: cls.tag,
      notes: cls.notes,
      classType: cls.classType,
      room: cls.room,
      coach: {
        id: cls.coach.id,
        userId: cls.coach.userId,
        name: cls.coach.name || cls.coach.user?.name || null,
        photoUrl: cls.coach.photoUrl || cls.coach.user?.image || null,
        bio: cls.coach.bio,
        specialties: cls.coach.specialties,
      },
      bookingsCount: cls._count.bookings,
      waitlistCount: cls._count.waitlist,
    };

    return cors(result, 200);
  } catch (error) {
    console.error("GET /api/embed/classes/[id] error:", error);
    return cors({ error: "Failed to fetch class" }, 500);
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: headers() });
}

function headers() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
  };
}

function cors(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: headers() });
}
