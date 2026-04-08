import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const booking = await prisma.booking.findFirst({
      where: {
        tenantId: tenant.id,
        userId: session.user.id,
        status: "ATTENDED",
        class: {
          endsAt: { gte: cutoff, lte: new Date() },
          ratings: { none: { userId: session.user.id } },
        },
      },
      orderBy: { class: { endsAt: "desc" } },
      include: {
        class: {
          include: {
            classType: { select: { id: true, name: true, color: true, icon: true } },
            coach: {
              select: {
                id: true,
                name: true,
                photoUrl: true,
                color: true,
                user: { select: { image: true } },
              },
            },
          },
        },
      },
    });

    if (!booking) return NextResponse.json(null);

    const c = booking.class;
    return NextResponse.json({
      classId: c.id,
      className: c.classType.name,
      classTypeId: c.classType.id,
      classColor: c.classType.color,
      classIcon: c.classType.icon,
      coachName: c.coach.name,
      coachPhoto: c.coach.photoUrl || c.coach.user?.image,
      coachColor: c.coach.color,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
    });
  } catch (error) {
    console.error("GET /api/ratings/pending error:", error);
    return NextResponse.json({ error: "Failed to fetch pending rating" }, { status: 500 });
  }
}
