import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

/**
 * Public, tenant-scoped classes endpoint for the embeddable widget.
 *
 * No session required — returns only public-safe class data (no friend
 * bookings, no personal booking state). Tenant is resolved from the
 * `x-tenant-slug` header injected by middleware based on subdomain.
 *
 * CORS is wide open so a tenant can embed this on any domain they own.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await getTenant();
    if (!tenant) {
      return corsJson({ error: "Tenant not found" }, 404);
    }

    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const typeId = searchParams.get("typeId");
    const coachId = searchParams.get("coachId");
    const level = searchParams.get("level");
    const studioId = searchParams.get("studioId");

    const where: Record<string, unknown> = {
      tenantId: tenant.id,
      status: { not: "CANCELLED" },
    };

    if (from || to) {
      where.startsAt = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    if (typeId) where.classTypeId = typeId;
    if (coachId) {
      const profile = await prisma.coachProfile.findFirst({
        where: { userId: coachId, tenantId: tenant.id },
        select: { id: true },
      });
      where.coachId = profile ? profile.id : coachId;
    }
    if (level) where.classType = { level };
    if (studioId) where.room = { studioId };

    const classes = await prisma.class.findMany({
      where,
      include: {
        classType: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
            level: true,
            duration: true,
          },
        },
        room: {
          select: {
            id: true,
            maxCapacity: true,
            studio: { select: { id: true, name: true } },
          },
        },
        coach: {
          select: {
            id: true,
            userId: true,
            name: true,
            photoUrl: true,
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
      orderBy: { startsAt: "asc" },
    });

    const result = classes.map((c) => ({
      id: c.id,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      tag: c.tag,
      classType: c.classType,
      room: c.room,
      coach: {
        id: c.coach.id,
        userId: c.coach.userId,
        name: c.coach.name || c.coach.user?.name || null,
        photoUrl: c.coach.photoUrl || c.coach.user?.image || null,
      },
      bookingsCount: c._count.bookings,
      waitlistCount: c._count.waitlist,
    }));

    return corsJson(result, 200);
  } catch (error) {
    console.error("GET /api/embed/classes error:", error);
    return corsJson({ error: "Failed to fetch classes" }, 500);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    // Short cache to reduce load when many visitors hit the embed at once.
    "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
  };
}

function corsJson(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsHeaders() });
}
