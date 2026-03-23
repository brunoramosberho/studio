import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const { id } = await params;

    const events = await prisma.feedEvent.findMany({
      where: { eventType: "CLASS_COMPLETED" },
      orderBy: { createdAt: "desc" },
    });

    const feedEvent = events.find((e) => {
      const payload = e.payload as Record<string, unknown> | null;
      return payload?.classId === id;
    });

    if (!feedEvent) {
      return NextResponse.json({ feedEvent: null });
    }

    const [photos, comments, likeCount, myLike] = await Promise.all([
      prisma.photo.findMany({
        where: { feedEventId: feedEvent.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, image: true } } },
      }),
      prisma.comment.findMany({
        where: { feedEventId: feedEvent.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, image: true } } },
      }),
      prisma.like.count({ where: { feedEventId: feedEvent.id } }),
      session?.user?.id
        ? prisma.like.findUnique({
            where: {
              userId_feedEventId: {
                userId: session.user.id,
                feedEventId: feedEvent.id,
              },
            },
          })
        : null,
    ]);

    return NextResponse.json({
      feedEvent: {
        id: feedEvent.id,
        payload: feedEvent.payload,
        createdAt: feedEvent.createdAt,
        photos,
        comments,
        likeCount,
        liked: !!myLike,
      },
    });
  } catch (error) {
    console.error("GET /api/classes/[id]/feed error:", error);
    return NextResponse.json(
      { error: "Failed to fetch class feed" },
      { status: 500 },
    );
  }
}
