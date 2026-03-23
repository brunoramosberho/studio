import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      NOT: [
        { email: { contains: "filler" } },
        { email: { contains: "waitlist" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      packages: {
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
    orderBy: { createdAt: "asc" },
  });

  const result = clients.map((c) => {
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
