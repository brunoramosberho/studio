import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json([]);
    }

    const tenant = await requireTenant();
    const { id: classId } = await params;

    const friendships = await prisma.friendship.findMany({
      where: {
        tenantId: tenant.id,
        status: "ACCEPTED",
        OR: [
          { requesterId: session.user.id },
          { addresseeId: session.user.id },
        ],
      },
      select: { requesterId: true, addresseeId: true },
    });

    const friendIds = friendships.map((f) =>
      f.requesterId === session.user.id ? f.addresseeId : f.requesterId,
    );

    const allowedUserIds = [session.user.id, ...friendIds];

    const bookingsWithBiometrics = await prisma.booking.findMany({
      where: {
        classId,
        tenantId: tenant.id,
        userId: { in: allowedUserIds },
        status: { in: ["ATTENDED", "CONFIRMED"] },
        biometrics: { some: {} },
      },
      select: {
        userId: true,
        user: { select: { id: true, name: true, image: true } },
        biometrics: {
          take: 1,
          select: {
            provider: true,
            calories: true,
            hrAvg: true,
            hrMax: true,
          },
        },
      },
    });

    const results = bookingsWithBiometrics
      .filter((b) => b.user && b.biometrics.length > 0)
      .map((b) => ({
        user: { id: b.user!.id, name: b.user!.name, image: b.user!.image },
        isMe: b.userId === session.user.id,
        ...b.biometrics[0],
      }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("GET /api/classes/[id]/biometrics error:", error);
    return NextResponse.json([]);
  }
}
