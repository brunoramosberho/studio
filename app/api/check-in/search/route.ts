import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q")?.trim();
    const classId = searchParams.get("classId");

    if (!q || q.length < 2) {
      return NextResponse.json([]);
    }

    const members = await prisma.user.findMany({
      where: {
        memberships: { some: { tenantId: ctx.tenant.id, role: "CLIENT" } },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
      take: 5,
    });

    if (!classId) {
      return NextResponse.json(
        members.map((m) => ({ ...m, classStatus: "not_enrolled" as const })),
      );
    }

    const [bookings, waitlists] = await Promise.all([
      prisma.booking.findMany({
        where: {
          classId,
          userId: { in: members.map((m) => m.id) },
          status: { in: ["CONFIRMED", "ATTENDED", "NO_SHOW"] },
        },
        select: { userId: true },
      }),
      prisma.waitlist.findMany({
        where: {
          classId,
          userId: { in: members.map((m) => m.id) },
        },
        select: { userId: true },
      }),
    ]);

    const enrolledSet = new Set(bookings.map((b) => b.userId));
    const waitlistSet = new Set(waitlists.map((w) => w.userId));

    const result = members.map((m) => ({
      ...m,
      classStatus: enrolledSet.has(m.id)
        ? ("enrolled" as const)
        : waitlistSet.has(m.id)
          ? ("waitlist" as const)
          : ("not_enrolled" as const),
    }));

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("GET /api/check-in/search error:", error);
    return NextResponse.json({ error: "Failed to search members" }, { status: 500 });
  }
}
