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

  const tenantMemberIds = await prisma.membership.findMany({
    where: { tenantId: tenant.id, role: "CLIENT", userId: { notIn: [...excludeIds] } },
    select: { userId: true },
  });
  const memberIdSet = new Set(tenantMemberIds.map((m) => m.userId));

  const myClassIds = await prisma.booking.findMany({
    where: { userId, status: { in: ["CONFIRMED", "ATTENDED"] } },
    select: { classId: true },
  });

  const classIds = myClassIds.map((b) => b.classId);

  let suggestions: { id: string; name: string | null; image: string | null; mutualClasses: number }[] = [];

  if (classIds.length > 0) {
    const coAttendees = await prisma.booking.groupBy({
      by: ["userId"],
      where: {
        classId: { in: classIds },
        userId: { notIn: [...excludeIds], in: [...memberIdSet] },
        status: { in: ["CONFIRMED", "ATTENDED"] },
      },
      _count: { classId: true },
      orderBy: { _count: { classId: "desc" } },
      take: 10,
    });

    const userIds = coAttendees.map((a) => a.userId).filter((id): id is string => id !== null);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    suggestions = coAttendees
      .filter((a) => a.userId && userMap.has(a.userId))
      .map((a) => ({
        ...userMap.get(a.userId!)!,
        mutualClasses: a._count.classId,
      }));
  }

  if (suggestions.length < 5) {
    const fillerMembers = await prisma.membership.findMany({
      where: {
        tenantId: tenant.id,
        role: "CLIENT",
        userId: { notIn: [...excludeIds, ...suggestions.map((s) => s.id)] },
        user: {
          email: { not: { contains: "filler" } },
          name: { not: { contains: "Waitlist" } },
        },
      },
      select: { user: { select: { id: true, name: true, image: true } } },
      take: 5 - suggestions.length,
      orderBy: { createdAt: "desc" },
    });

    suggestions.push(...fillerMembers.map((m) => ({ ...m.user, mutualClasses: 0 })));
  }

  return NextResponse.json(suggestions);
}
