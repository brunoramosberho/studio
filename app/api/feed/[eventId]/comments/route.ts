import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;

    const comments = await prisma.comment.findMany({
      where: { feedEventId: eventId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error("GET /api/feed/[eventId]/comments error:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 },
    );
  }
}

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
    const body = await request.json();
    const { body: commentBody, parentId } = body as {
      body: string;
      parentId?: string;
    };

    if (!commentBody?.trim()) {
      return NextResponse.json(
        { error: "Comment body is required" },
        { status: 400 },
      );
    }

    const comment = await prisma.comment.create({
      data: {
        userId: session.user.id,
        feedEventId: eventId,
        body: commentBody.trim(),
        parentId: parentId ?? null,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("POST /api/feed/[eventId]/comments error:", error);
    return NextResponse.json(
      { error: "Failed to add comment" },
      { status: 500 },
    );
  }
}
