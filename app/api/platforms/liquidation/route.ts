import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { PlatformType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // YYYY-MM

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "month query param required (YYYY-MM)" }, { status: 400 });
    }

    const [year, m] = month.split("-").map(Number);
    const monthStart = new Date(year, m - 1, 1);
    const monthEnd = new Date(year, m, 1);

    const bookings = await prisma.platformBooking.findMany({
      where: {
        tenantId: tenant.id,
        class: { startsAt: { gte: monthStart, lt: monthEnd } },
        status: { in: ["checked_in", "absent"] },
      },
      include: {
        class: {
          include: {
            classType: { select: { name: true } },
          },
        },
      },
      orderBy: { class: { startsAt: "asc" } },
    });

    const configs = await prisma.studioPlatformConfig.findMany({
      where: { tenantId: tenant.id },
      select: { platform: true, ratePerVisit: true },
    });

    const rateByPlatform = Object.fromEntries(
      configs.map((c) => [c.platform, c.ratePerVisit ?? 0]),
    ) as Record<PlatformType, number>;

    const byPlatform: Record<string, {
      platform: PlatformType;
      checkedIn: Array<{ className: string; date: string; bookingId: string }>;
      absent: Array<{ className: string; date: string; bookingId: string }>;
      rate: number;
      totalEstimated: number;
    }> = {};

    for (const b of bookings) {
      const key = b.platform;
      if (!byPlatform[key]) {
        byPlatform[key] = {
          platform: b.platform,
          checkedIn: [],
          absent: [],
          rate: rateByPlatform[b.platform] ?? 0,
          totalEstimated: 0,
        };
      }

      const entry = {
        className: b.class.classType.name,
        date: b.class.startsAt.toISOString().split("T")[0],
        bookingId: b.id,
      };

      if (b.status === "checked_in") {
        byPlatform[key].checkedIn.push(entry);
        byPlatform[key].totalEstimated += byPlatform[key].rate;
      } else {
        byPlatform[key].absent.push(entry);
      }
    }

    const grandTotal = Object.values(byPlatform).reduce(
      (sum, p) => sum + p.totalEstimated,
      0,
    );

    return NextResponse.json({
      month,
      platforms: Object.values(byPlatform),
      grandTotal,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/liquidation error:", error);
    return NextResponse.json({ error: "Failed to calculate liquidation" }, { status: 500 });
  }
}
