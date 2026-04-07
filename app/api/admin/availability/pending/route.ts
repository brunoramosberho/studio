import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { getSubstituteSuggestions, getZone } from "@/lib/availability";
import { startOfDay, eachDayOfInterval, format } from "date-fns";
import { es } from "date-fns/locale";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");

    const blocks = await prisma.coachAvailabilityBlock.findMany({
      where: { tenantId: tenant.id, status: "pending_approval" },
      include: {
        coach: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const enriched = await Promise.all(
      blocks.map(async (block) => {
        const coachProfile = await prisma.coachProfile.findFirst({
          where: { userId: block.coachId, tenantId: tenant.id },
          select: { id: true, color: true },
        });

        let affectedClasses: {
          id: string;
          date: string;
          time: string;
          name: string;
          enrolled: number;
          capacity: number;
          substitute: {
            name: string;
            available: boolean;
            hasDiscipline: boolean;
          } | null;
        }[] = [];

        if (block.type === "one_time" && block.startDate && block.endDate) {
          const days = eachDayOfInterval({
            start: startOfDay(block.startDate),
            end: startOfDay(block.endDate),
          });

          const classes = await prisma.class.findMany({
            where: {
              tenantId: tenant.id,
              coachId: coachProfile?.id ?? "__none__",
              status: "SCHEDULED",
              startsAt: { gte: block.startDate, lte: block.endDate },
            },
            include: {
              classType: { select: { name: true } },
              room: { select: { maxCapacity: true } },
              _count: {
                select: {
                  bookings: { where: { status: "CONFIRMED" } },
                },
              },
            },
            orderBy: { startsAt: "asc" },
          });

          affectedClasses = await Promise.all(
            classes.map(async (c) => {
              const subs = await getSubstituteSuggestions(
                c.id,
                c.startsAt,
                tenant.id,
              );
              const bestSub =
                subs.find((s) => s.available && s.hasDiscipline) ||
                subs.find((s) => s.available) ||
                null;

              return {
                id: c.id,
                date: format(c.startsAt, "EEE d MMM", { locale: es }),
                time: format(c.startsAt, "HH:mm"),
                name: c.classType.name,
                enrolled: c._count.bookings,
                capacity: c.room.maxCapacity,
                substitute: bestSub
                  ? {
                      name: bestSub.name,
                      available: bestSub.available,
                      hasDiscipline: bestSub.hasDiscipline,
                    }
                  : null,
              };
            }),
          );
        }

        const zone = block.startDate ? getZone(block.startDate, tenant) : "green";

        return {
          ...block,
          coachColor: coachProfile?.color ?? "#C9A96E",
          zone,
          affectedClasses,
          uncoveredCount: affectedClasses.filter((c) => !c.substitute).length,
        };
      }),
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/admin/availability/pending error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending blocks" },
      { status: 500 },
    );
  }
}
