import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.userWearableConnection.updateMany({
      where: {
        userId: session.user.id,
        provider: "STRAVA",
        disconnectedAt: null,
      },
      data: {
        disconnectedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/auth/strava/disconnect error:", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
