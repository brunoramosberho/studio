import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { startOfDay, endOfDay } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const dateStr = request.nextUrl.searchParams.get("date");
    if (!dateStr) {
      return NextResponse.json(
        { error: "date parameter required" },
        { status: 400 },
      );
    }

    const date = new Date(dateStr + "T00:00:00");
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const openH = parseInt(tenant.studioOpenTime.split(":")[0]);
    const closeH = parseInt(tenant.studioCloseTime.split(":")[0]);

    const coachProfiles = await prisma.coachProfile.findMany({
      where: { tenantId: tenant.id },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    const allBlocks = await prisma.coachAvailabilityBlock.findMany({
      where: {
        tenantId: tenant.id,
        coachId: { in: coachProfiles.map((p) => p.userId).filter((id): id is string => id != null) },
        status: "active",
      },
    });

    const dayClasses = await prisma.class.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: { gte: dayStart, lte: dayEnd },
        status: "SCHEDULED",
      },
      include: {
        classType: { select: { name: true } },
      },
    });

    const dow = date.getDay();
    const jsDow = dow === 0 ? 6 : dow - 1;

    type SlotStatus = "available" | "blocked" | "class" | "empty";
    type Slot = { hour: number; status: SlotStatus; className?: string };

    const coaches = coachProfiles.map((profile) => {
      const initials = (profile.name || "C")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      const coachBlocks = allBlocks.filter(
        (b) => b.coachId === profile.userId,
      );
      const coachClasses = dayClasses.filter(
        (c) => c.coachId === profile.id,
      );

      const slots: Slot[] = [];

      for (let h = openH; h < closeH; h++) {
        const classAtHour = coachClasses.find((c) => {
          const classH = c.startsAt.getHours();
          return classH === h;
        });

        if (classAtHour) {
          slots.push({
            hour: h,
            status: "class",
            className: classAtHour.classType.name,
          });
          continue;
        }

        let isBlocked = false;
        for (const b of coachBlocks) {
          if (b.type === "one_time" && b.startDate && b.endDate) {
            const s = startOfDay(b.startDate);
            const e = startOfDay(b.endDate);
            if (dayStart >= s && dayStart <= e) {
              if (b.isAllDay) {
                isBlocked = true;
                break;
              }
              if (b.startTime && b.endTime) {
                const bStartH = parseInt(b.startTime.split(":")[0]);
                const bEndH = parseInt(b.endTime.split(":")[0]);
                if (h >= bStartH && h < bEndH) {
                  isBlocked = true;
                  break;
                }
              }
            }
          }
          if (
            b.type === "recurring" &&
            b.dayOfWeek.includes(jsDow)
          ) {
            if (!b.startTime || !b.endTime) {
              isBlocked = true;
              break;
            }
            const bStartH = parseInt(b.startTime.split(":")[0]);
            const bEndH = parseInt(b.endTime.split(":")[0]);
            if (h >= bStartH && h < bEndH) {
              isBlocked = true;
              break;
            }
          }
        }

        if (isBlocked) {
          slots.push({ hour: h, status: "blocked" });
        } else if (coachClasses.length > 0 || coachBlocks.length > 0) {
          slots.push({ hour: h, status: "available" });
        } else {
          slots.push({ hour: h, status: "empty" });
        }
      }

      return {
        coachId: profile.userId,
        coachProfileId: profile.id,
        coachName: profile.name || "Coach",
        initials,
        color: profile.color,
        image: profile.photoUrl || profile.user?.image,
        slots,
      };
    });

    const classTypes = await prisma.classType.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const disciplines = classTypes.map((ct) => ct.name);

    const allClasses = await prisma.class.findMany({
      where: { tenantId: tenant.id, status: "SCHEDULED" },
      select: { coachId: true, classTypeId: true },
    });

    const classTypeNameById = Object.fromEntries(
      classTypes.map((ct) => [ct.id, ct.name]),
    );

    const coachDisciplines: Record<string, string[]> = {};
    for (const c of allClasses) {
      const name = classTypeNameById[c.classTypeId];
      if (!name) continue;
      if (!coachDisciplines[c.coachId]) coachDisciplines[c.coachId] = [];
      if (!coachDisciplines[c.coachId].includes(name)) {
        coachDisciplines[c.coachId].push(name);
      }
    }

    const enrichedCoaches = coaches.map((c) => ({
      ...c,
      disciplines: coachDisciplines[c.coachProfileId] ?? [],
    }));

    return NextResponse.json({
      coaches: enrichedCoaches,
      disciplines,
      openHour: openH,
      closeHour: closeH,
    });
  } catch (error) {
    console.error("GET /api/admin/availability/hourly error:", error);
    return NextResponse.json(
      { error: "Failed to fetch hourly data" },
      { status: 500 },
    );
  }
}
