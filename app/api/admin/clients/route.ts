import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  const ctx = await requireRole("ADMIN");

  const memberships = await prisma.membership.findMany({
    where: {
      tenantId: ctx.tenant.id,
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
          packages: {
            where: { tenantId: ctx.tenant.id },
            orderBy: { expiresAt: "desc" },
            take: 1,
            include: { package: { select: { name: true } } },
          },
          bookings: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
              class: {
                include: { classType: { select: { name: true } } },
              },
            },
          },
          _count: { select: { bookings: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const result = memberships.map((m) => {
    const c = m.user;
    const activePkg = c.packages.find(
      (p) => new Date(p.expiresAt) > new Date(),
    );

    const lastAttended = c.bookings.find((b) => b.status === "ATTENDED");

    return {
      id: c.id,
      name: c.name,
      email: c.email,
      image: c.image,
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
      bookingHistory: c.bookings.map((b) => ({
        id: b.id,
        className: b.class.classType.name,
        date: b.class.startsAt.toISOString(),
        status: b.status,
      })),
    };
  });

  return NextResponse.json(result);
}
