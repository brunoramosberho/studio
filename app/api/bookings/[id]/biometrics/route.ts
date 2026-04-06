import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: bookingId } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true },
    });

    if (!booking || booking.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const biometrics = await prisma.classBiometrics.findFirst({
      where: { bookingId },
      select: {
        id: true,
        provider: true,
        calories: true,
        hrAvg: true,
        hrMax: true,
        createdAt: true,
      },
    });

    return NextResponse.json(biometrics);
  } catch (error) {
    console.error("GET /api/bookings/[id]/biometrics error:", error);
    return NextResponse.json({ error: "Failed to fetch biometrics" }, { status: 500 });
  }
}
