import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

// POST toggles the current user's like on a comment.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; commentId: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { eventId, commentId } = await params;

    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        feedEventId: eventId,
        feedEvent: { tenantId: tenant.id },
      },
      select: { id: true },
    });
    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const existing = await prisma.commentLike.findUnique({
      where: { userId_commentId: { userId: session.user.id, commentId } },
    });

    if (existing) {
      await prisma.commentLike.delete({ where: { id: existing.id } });
      return NextResponse.json({ liked: false });
    }

    await prisma.commentLike.create({
      data: { userId: session.user.id, commentId },
    });
    return NextResponse.json({ liked: true });
  } catch (error) {
    console.error("POST comment like error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
