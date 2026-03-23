import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
    const body = await request.json().catch(() => ({}));
    const type = (body as { type?: string }).type ?? "like";

    const existing = await prisma.like.findUnique({
      where: { userId_feedEventId: { userId: session.user.id, feedEventId: eventId } },
    });

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      return NextResponse.json({ liked: false });
    }

    await prisma.like.create({
      data: {
        userId: session.user.id,
        feedEventId: eventId,
        type,
      },
    });

    return NextResponse.json({ liked: true, type });
  } catch (error) {
    console.error("POST /api/feed/[eventId]/like error:", error);
    return NextResponse.json(
      { error: "Failed to toggle like" },
      { status: 500 },
    );
  }
}
