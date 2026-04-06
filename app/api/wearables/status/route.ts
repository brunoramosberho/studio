import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connections = await prisma.userWearableConnection.findMany({
      where: {
        userId: session.user.id,
        disconnectedAt: null,
      },
      select: {
        id: true,
        provider: true,
        providerUserId: true,
        createdAt: true,
      },
    });

    const providers: Record<string, { connected: boolean; providerUserId?: string; connectedAt?: string }> = {
      STRAVA: { connected: false },
    };

    for (const conn of connections) {
      providers[conn.provider] = {
        connected: true,
        providerUserId: conn.providerUserId,
        connectedAt: conn.createdAt.toISOString(),
      };
    }

    return NextResponse.json(providers);
  } catch (error) {
    console.error("GET /api/wearables/status error:", error);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
