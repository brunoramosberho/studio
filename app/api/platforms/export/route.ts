import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { PlatformType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { searchParams } = new URL(request.url);

    const platform = searchParams.get("platform") as PlatformType | null;
    const weekStart = searchParams.get("weekStart");

    if (!platform || !["classpass", "wellhub"].includes(platform)) {
      return NextResponse.json({ error: "platform query param required (classpass|wellhub)" }, { status: 400 });
    }

    if (!weekStart) {
      return NextResponse.json({ error: "weekStart query param required (YYYY-MM-DD)" }, { status: 400 });
    }

    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const quotas = await prisma.schedulePlatformQuota.findMany({
      where: {
        tenantId: tenant.id,
        platform,
        quotaSpots: { gt: 0 },
        isClosedManually: false,
        class: { startsAt: { gte: start, lt: end }, status: "SCHEDULED" },
      },
      include: {
        class: {
          include: {
            classType: { select: { name: true, duration: true } },
            coach: { include: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { class: { startsAt: "asc" } },
    });

    let csv: string;

    if (platform === "classpass") {
      csv = "name,date,start_time,duration,instructor,spots,credits\n";
      for (const q of quotas) {
        const c = q.class;
        const date = c.startsAt.toISOString().split("T")[0];
        const time = c.startsAt.toISOString().split("T")[1].slice(0, 5);
        const name = c.classType.name;
        const duration = c.classType.duration;
        const instructor = c.coach.name ?? "TBD";
        csv += `${name},${date},${time},${duration},${instructor},${q.quotaSpots},3\n`;
      }
    } else {
      csv = "class_name,date,time,duration_min,trainer,max_participants\n";
      for (const q of quotas) {
        const c = q.class;
        const d = c.startsAt;
        const date = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
        const time = c.startsAt.toISOString().split("T")[1].slice(0, 5);
        const name = c.classType.name;
        const duration = c.classType.duration;
        const trainer = c.coach.name ?? "TBD";
        csv += `${name},${date},${time},${duration},${trainer},${q.quotaSpots}\n`;
      }
    }

    await prisma.studioPlatformConfig.update({
      where: { tenantId_platform: { tenantId: tenant.id, platform } },
      data: { lastExportedAt: new Date() },
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${platform}-schedule-${weekStart}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/export error:", error);
    return NextResponse.json({ error: "Failed to export" }, { status: 500 });
  }
}
