import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { getEntityUrl, slugify } from "@/lib/marketing/links";

const DAY_NAMES: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;
    const tenantSlug = ctx.tenant.slug;

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fourteenDaysFromNow = new Date();
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

    const [classTypes, upcomingClasses, packages, products, clicks, conversions] =
      await Promise.all([
        prisma.classType.findMany({
          where: { tenantId },
          orderBy: { name: "asc" },
          include: { _count: { select: { classes: true } } },
        }),
        prisma.class.findMany({
          where: {
            tenantId,
            status: "SCHEDULED",
            startsAt: { gte: now, lte: fourteenDaysFromNow },
          },
          include: {
            classType: { select: { name: true, color: true } },
            coach: { include: { user: { select: { name: true } } } },
            room: { select: { name: true, maxCapacity: true } },
            _count: {
              select: {
                bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
              },
            },
          },
          orderBy: { startsAt: "asc" },
          take: 50,
        }),
        prisma.package.findMany({
          where: { tenantId, isActive: true },
          orderBy: { sortOrder: "asc" },
        }),
        prisma.product.findMany({
          where: { tenantId, isActive: true, isVisible: true },
          orderBy: { position: "asc" },
        }),
        prisma.linkClick.groupBy({
          by: ["entityType", "entityId"],
          where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
          _count: { id: true },
        }),
        prisma.linkConversion.groupBy({
          by: ["entityType", "entityId"],
          where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
          _count: { id: true },
          _sum: { revenue: true },
        }),
      ]);

    const clickMap = new Map(
      clicks.map((c) => [`${c.entityType}:${c.entityId}`, c._count.id])
    );
    const convMap = new Map(
      conversions.map((c) => [
        `${c.entityType}:${c.entityId}`,
        { count: c._count.id, revenue: c._sum.revenue || 0 },
      ])
    );

    function stats(type: string, id: string) {
      const key = `${type}:${id}`;
      const clickCount = clickMap.get(key) || 0;
      const conv = convMap.get(key) || { count: 0, revenue: 0 };
      return {
        clicks: clickCount,
        conversions: conv.count,
        revenue: conv.revenue,
      };
    }

    // Discipline links (filter schedule by classType)
    const disciplineLinks = classTypes.map((ct) => {
      const url = getEntityUrl(tenantSlug, "class", ct.name.toLowerCase());
      return {
        id: ct.id,
        name: ct.name,
        slug: slugify(ct.name),
        url,
        totalClasses: ct._count.classes,
        ...stats("class", ct.id),
      };
    });

    // Schedule link
    const scheduleLink = {
      id: "__schedule__",
      name: "Horario completo",
      slug: "schedule",
      url: getEntityUrl(tenantSlug, "schedule", ""),
      ...stats("schedule", "__schedule__"),
    };

    // Upcoming individual classes
    const classInstanceLinks = upcomingClasses.map((c) => {
      const day = DAY_NAMES[c.startsAt.getDay()] || "";
      const time = fmtTime(c.startsAt);
      const dateStr = c.startsAt.toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
      });
      const url = getEntityUrl(tenantSlug, "class-instance", c.id);

      return {
        id: c.id,
        name: c.classType.name,
        day,
        time,
        date: dateStr,
        coachName: c.coach?.user.name || null,
        spotsLeft: c.room.maxCapacity - c._count.bookings,
        capacity: c.room.maxCapacity,
        color: c.classType.color,
        slug: c.id,
        url,
        ...stats("class-instance", c.id),
      };
    });

    // Package links (each with individual deep link)
    const membershipLinks = packages.map((p) => {
      const url = getEntityUrl(tenantSlug, "membership", p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        type: p.type,
        isPromo: p.isPromo,
        slug: slugify(p.name),
        url,
        ...stats("membership", p.id),
      };
    });

    const productLinks = products.map((p) => {
      const url = getEntityUrl(tenantSlug, "product", "");
      return {
        id: p.id,
        name: p.name,
        price: p.price,
        currency: p.currency,
        slug: slugify(p.name),
        url,
        ...stats("product", p.id),
      };
    });

    const totalClicks = [...clickMap.values()].reduce((a, b) => a + b, 0);
    const totalConversions = [...convMap.values()].reduce(
      (a, b) => a + b.count,
      0
    );
    const totalRevenue = [...convMap.values()].reduce(
      (a, b) => a + b.revenue,
      0
    );

    return NextResponse.json({
      disciplines: disciplineLinks,
      classInstances: classInstanceLinks,
      schedule: scheduleLink,
      memberships: membershipLinks,
      products: productLinks,
      tenantSlug,
      totals: {
        clicks: totalClicks,
        conversions: totalConversions,
        revenue: totalRevenue,
        conversionRate:
          totalClicks > 0
            ? Math.round((totalConversions / totalClicks) * 10000) / 100
            : 0,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/marketing/links error:", error);
    return NextResponse.json(
      { error: "Failed to fetch links" },
      { status: 500 }
    );
  }
}
