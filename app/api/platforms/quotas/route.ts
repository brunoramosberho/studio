import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { PlatformType } from "@prisma/client";
import { PLATFORM_CONSUMING_STATUSES } from "@/lib/booking/availability";

// Returns one row PER CLASS for the requested week, each carrying its (possibly
// zero) ClassPass + Wellhub quota. We start from Class — not from
// SchedulePlatformQuota — so classes that have never had a quota set still show
// up and can be configured. (Starting from the quota table created a
// chicken-and-egg dead end: no quota row → class invisible → can't add a quota.)
export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    const classWhere: Record<string, unknown> = {
      tenantId: tenant.id,
      status: "SCHEDULED",
    };
    if (weekStart) {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      classWhere.startsAt = { gte: start, lt: end };
    }

    const classes = await prisma.class.findMany({
      where: classWhere,
      include: {
        classType: { select: { name: true, color: true, wellhubProductId: true } },
        room: { select: { name: true, maxCapacity: true } },
        coach: { select: { name: true } },
        platformQuotas: {
          select: { id: true, platform: true, quotaSpots: true, bookedSpots: true, isClosedManually: true },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    // Flatten to the shape the Quotas tab expects: one entry per (class,
    // platform) for the two platforms, defaulting to 0 spots when unset.
    const rows = classes.flatMap((cls) => {
      const byPlatform = new Map(cls.platformQuotas.map((q) => [q.platform, q]));
      const classPayload = {
        id: cls.id,
        startsAt: cls.startsAt,
        classType: { name: cls.classType.name, color: cls.classType.color },
        room: { name: cls.room.name, maxCapacity: cls.room.maxCapacity },
        coach: { name: cls.coach.name },
        wellhubMapped: cls.classType.wellhubProductId != null,
      };
      return (["classpass", "wellhub"] as PlatformType[]).map((platform) => {
        const q = byPlatform.get(platform);
        return {
          id: q?.id ?? `virtual-${cls.id}-${platform}`,
          classId: cls.id,
          platform,
          quotaSpots: q?.quotaSpots ?? 0,
          bookedSpots: q?.bookedSpots ?? 0,
          isClosedManually: q?.isClosedManually ?? false,
          class: classPayload,
        };
      });
    });

    return NextResponse.json(rows);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/quotas error:", error);
    return NextResponse.json({ error: "Failed to fetch quotas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json();
    const { classId, platform, quotaSpots } = body as {
      classId: string;
      platform: PlatformType;
      quotaSpots: number;
    };

    if (!classId || !platform || quotaSpots == null) {
      return NextResponse.json({ error: "classId, platform, and quotaSpots are required" }, { status: 400 });
    }

    if (!["classpass", "wellhub"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }
    if (quotaSpots < 0) {
      return NextResponse.json({ error: "quotaSpots must be >= 0" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: tenant.id },
      include: { room: { select: { maxCapacity: true } } },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Guard against a single platform quota exceeding the physical room. (We
    // don't sum across platforms here since the other platform is saved in a
    // separate call; the UI shows the combined bar + an over-capacity warning.)
    if (quotaSpots > cls.room.maxCapacity) {
      return NextResponse.json(
        { error: `El cupo (${quotaSpots}) supera la capacidad del salón (${cls.room.maxCapacity}).` },
        { status: 400 },
      );
    }

    const quota = await prisma.schedulePlatformQuota.upsert({
      where: { classId_platform: { classId, platform } },
      create: {
        tenantId: tenant.id,
        classId,
        platform,
        quotaSpots,
      },
      update: { quotaSpots },
    });

    // Keep Wellhub's published availability in sync when a Wellhub quota
    // changes (capacity bar in their app reflects total_capacity = quotaSpots).
    if (platform === "wellhub") {
      try {
        const { syncClassToWellhub, patchWellhubCapacityForClass } = await import("@/lib/platforms/wellhub");
        // If quota went from 0 → N the slot may not exist yet; ensure it's synced.
        await syncClassToWellhub(classId);
        await patchWellhubCapacityForClass(classId);
      } catch (err) {
        console.error("[wellhub] sync after quota change failed", err);
      }
    }

    return NextResponse.json(quota);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/quotas error:", error);
    return NextResponse.json({ error: "Failed to save quota" }, { status: 500 });
  }
}
