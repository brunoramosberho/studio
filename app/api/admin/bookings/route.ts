import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

const PAGE_SIZE = 30;

/**
 * Time-ordered booking activity feed for the admin dashboard "Recent bookings →
 * View all" list. Cursor-paginated (cursor = last booking id), newest first.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const cursor = request.nextUrl.searchParams.get("cursor");

    const rows = await prisma.booking.findMany({
      where: {
        status: { in: ["CONFIRMED", "ATTENDED"] },
        class: { tenantId: ctx.tenant.id },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, name: true, image: true } },
        class: {
          select: {
            startsAt: true,
            classType: { select: { name: true } },
            coach: { select: { name: true } },
            room: { select: { studio: { select: { name: true } } } },
          },
        },
        platformBooking: { select: { platform: true } },
      },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    return NextResponse.json({
      bookings: page.map((b) => ({
        id: b.id,
        userId: b.user?.id ?? null,
        userName: b.user?.name ?? b.guestName ?? "Invitado",
        userImage: b.user?.image ?? null,
        className: b.class.classType.name,
        coachName: b.class.coach?.name ?? null,
        studioName: b.class.room?.studio?.name ?? null,
        classStartsAt: b.class.startsAt.toISOString(),
        platform: b.platformBooking?.platform ?? null,
        status: b.status,
        createdAt: b.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
