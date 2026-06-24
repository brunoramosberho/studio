import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { PlatformType } from "@prisma/client";
import {
  computeSettlement,
  type SettlementInput,
  type SettlementEventType,
} from "@/lib/platforms/liquidation-math";

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

    // Pull every payable event this month: check-ins (checked_in), no-shows
    // (absent), and late cancellations (cancelled + late marker).
    const bookings = await prisma.platformBooking.findMany({
      where: {
        tenantId: tenant.id,
        class: { startsAt: { gte: monthStart, lt: monthEnd } },
        OR: [
          { status: { in: ["checked_in", "absent"] } },
          { status: "cancelled", notes: "wellhub_late_cancel" },
        ],
      },
      include: { class: { include: { classType: { select: { name: true } } } } },
      orderBy: { class: { startsAt: "asc" } },
    });

    const configs = await prisma.studioPlatformConfig.findMany({
      where: { tenantId: tenant.id },
      select: {
        platform: true,
        ratePerVisit: true,
        maxPayoutPerVisitor: true,
        noShowPercent: true,
        lateCancelPercent: true,
        freeVisitsPerMonth: true,
      },
    });
    const configByPlatform = Object.fromEntries(configs.map((c) => [c.platform, c]));

    // Classify each booking into a settlement event type.
    function eventType(b: (typeof bookings)[number]): SettlementEventType {
      if (b.status === "checked_in") return "checkin";
      if (b.status === "absent") return "no_show";
      return "late_cancel";
    }

    // Group raw bookings + settlement inputs per platform.
    const rawByPlatform = new Map<
      PlatformType,
      { bookings: typeof bookings; events: SettlementInput[] }
    >();
    for (const b of bookings) {
      const bucket = rawByPlatform.get(b.platform) ?? { bookings: [], events: [] };
      bucket.bookings.push(b);
      bucket.events.push({
        // Use the Wellhub visitor token for the per-visitor cap; fall back to a
        // per-booking id for email-sourced rows that lack a stable visitor id.
        visitorId: b.wellhubUserUniqueToken ?? `booking:${b.id}`,
        type: eventType(b),
      });
      rawByPlatform.set(b.platform, bucket);
    }

    const platforms = [...rawByPlatform.entries()].map(([platform, bucket]) => {
      const cfg = configByPlatform[platform];
      const conditions = {
        ratePerVisit: cfg?.ratePerVisit ?? 0,
        noShowPercent: cfg?.noShowPercent ?? 0,
        lateCancelPercent: cfg?.lateCancelPercent ?? 0,
        maxPayoutPerVisitor: cfg?.maxPayoutPerVisitor ?? null,
        freeVisitsPerMonth: cfg?.freeVisitsPerMonth ?? null,
      };
      const settlement = computeSettlement(bucket.events, conditions);

      const toEntry = (b: (typeof bookings)[number]) => ({
        className: b.class.classType.name,
        date: b.class.startsAt.toISOString().split("T")[0],
        bookingId: b.id,
      });

      return {
        platform,
        rate: conditions.ratePerVisit,
        conditions,
        checkedIn: bucket.bookings.filter((b) => b.status === "checked_in").map(toEntry),
        noShow: bucket.bookings.filter((b) => b.status === "absent").map(toEntry),
        lateCancel: bucket.bookings
          .filter((b) => b.status === "cancelled")
          .map(toEntry),
        breakdown: {
          payableCheckins: settlement.payableCheckins,
          payableNoShows: settlement.payableNoShows,
          payableLateCancels: settlement.payableLateCancels,
          freeVisitsApplied: settlement.freeVisitsApplied,
          cappedVisitors: settlement.cappedVisitors,
        },
        totalEstimated: settlement.total,
      };
    });

    const grandTotal = platforms.reduce((sum, p) => sum + p.totalEstimated, 0);

    return NextResponse.json({
      month,
      platforms,
      grandTotal: Math.round(grandTotal * 100) / 100,
      note: "Estimación basada en tus condiciones comerciales. El pago real lo confirma el panel de Wellhub.",
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/liquidation error:", error);
    return NextResponse.json({ error: "Failed to calculate liquidation" }, { status: 500 });
  }
}
