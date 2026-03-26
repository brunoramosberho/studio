import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function GET() {
  const { session, tenant } = await requireAuth();
  const userId = session.user.id;

  const existingFriendships = await prisma.friendship.findMany({
    where: {
      tenantId: tenant.id,
      OR: [{ requesterId: userId }, { addresseeId: userId }],
      status: { in: ["PENDING", "ACCEPTED"] },
    },
    select: { requesterId: true, addresseeId: true },
  });

  const excludeIds = new Set<string>([userId]);
  for (const f of existingFriendships) {
    excludeIds.add(f.requesterId);
    excludeIds.add(f.addresseeId);
  }

  const members = await prisma.membership.findMany({
    where: {
      tenantId: tenant.id,
      role: { not: "ADMIN" },
      userId: { notIn: [...excludeIds] },
      user: { name: { not: null } },
    },
    select: { user: { select: { id: true, name: true, image: true } } },
  });

  const memberMap = new Map(members.map((m) => [m.user.id, m.user]));

  const bookingUsers = await prisma.booking.findMany({
    where: {
      tenantId: tenant.id,
      userId: { notIn: [...excludeIds] },
      user: { name: { not: null } },
    },
    select: { user: { select: { id: true, name: true, image: true } } },
    distinct: ["userId"],
  });

  for (const b of bookingUsers) {
    if (b.user && !memberMap.has(b.user.id)) {
      memberMap.set(b.user.id, b.user);
    }
  }

  let mutualMap = new Map<string, number>();

  const myClassIds = await prisma.booking.findMany({
    where: { userId, status: { in: ["CONFIRMED", "ATTENDED"] } },
    select: { classId: true },
  });
  const classIds = myClassIds.map((b) => b.classId);

  if (classIds.length > 0) {
    const coAttendees = await prisma.booking.groupBy({
      by: ["userId"],
      where: {
        classId: { in: classIds },
        userId: { in: [...memberMap.keys()] },
        status: { in: ["CONFIRMED", "ATTENDED"] },
      },
      _count: { classId: true },
    });

    for (const a of coAttendees) {
      if (a.userId) mutualMap.set(a.userId, a._count.classId);
    }
  }

  const suggestions = [...memberMap.values()]
    .map((user) => ({
      ...user,
      mutualClasses: mutualMap.get(user.id) ?? 0,
    }))
    .sort((a, b) => b.mutualClasses - a.mutualClasses || (a.name ?? "").localeCompare(b.name ?? ""));

  return NextResponse.json(suggestions);
}
