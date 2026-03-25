import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const ctx = await requireRole("ADMIN");
  const tenantId = ctx.tenant.id;
  const filter = request.nextUrl.searchParams.get("filter") ?? "all";

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const memberships = await prisma.membership.findMany({
    where: {
      tenantId,
      role: "CLIENT",
      user: {
        NOT: [
          { email: { contains: "filler" } },
          { email: { contains: "waitlist" } },
        ],
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          packages: {
            where: { tenantId },
            orderBy: { expiresAt: "desc" },
            take: 3,
            include: { package: { select: { name: true } } },
          },
          bookings: {
            where: { class: { tenantId } },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              class: {
                include: { classType: { select: { name: true } } },
              },
            },
          },
          _count: {
            select: {
              bookings: { where: { class: { tenantId } } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const result = memberships.map((m) => {
    const c = m.user;
    const activePkg = c.packages.find(
      (p) => new Date(p.expiresAt) > now,
    );

    const attendedBookings = c.bookings.filter(
      (b) => b.status === "ATTENDED",
    );
    const lastAttended = attendedBookings[0];

    const classesThisMonth = c.bookings.filter(
      (b) =>
        b.status === "ATTENDED" &&
        new Date(b.class.startsAt) >= monthStart,
    ).length;

    const lastVisitedDate = lastAttended
      ? new Date(lastAttended.class.startsAt)
      : null;
    const daysSinceLastVisit = lastVisitedDate
      ? Math.floor((now.getTime() - lastVisitedDate.getTime()) / 86400000)
      : null;

    return {
      id: c.id,
      name: c.name,
      email: c.email,
      image: c.image,
      memberSince: m.createdAt.toISOString(),
      classesThisMonth,
      daysSinceLastVisit,
      activePackage: activePkg
        ? {
            id: activePkg.id,
            packageName: activePkg.package.name,
            creditsRemaining:
              activePkg.creditsTotal === null
                ? -1
                : activePkg.creditsTotal - activePkg.creditsUsed,
            expiresAt: activePkg.expiresAt.toISOString(),
          }
        : null,
      bookingsCount: c._count.bookings,
      lastVisited: lastAttended
        ? lastAttended.class.startsAt.toISOString()
        : null,
      bookingHistory: c.bookings.slice(0, 5).map((b) => ({
        id: b.id,
        className: b.class.classType.name,
        date: b.class.startsAt.toISOString(),
        status: b.status,
      })),
    };
  });

  // Apply filter
  const filtered = result.filter((client) => {
    switch (filter) {
      case "active":
        return client.activePackage !== null;
      case "expiring":
        return (
          client.activePackage !== null &&
          new Date(client.activePackage.expiresAt) <= sevenDaysFromNow
        );
      case "inactive":
        return (
          client.daysSinceLastVisit !== null &&
          client.daysSinceLastVisit > 14
        );
      case "new":
        return new Date(client.memberSince) >= thirtyDaysAgo;
      default:
        return true;
    }
  });

  return NextResponse.json(filtered);
}
