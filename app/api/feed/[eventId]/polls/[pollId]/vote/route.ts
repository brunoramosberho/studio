import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, getAuthContext } from "@/lib/tenant";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; pollId: string }> },
) {
  try {
    const tenant = await requireTenant();
    const ctx = await getAuthContext();
    const userId = ctx?.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { pollId } = await params;
    const { optionId } = await request.json();

    if (!optionId) {
      return NextResponse.json({ error: "optionId is required" }, { status: 400 });
    }

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        feedEvent: { select: { tenantId: true } },
        options: { select: { id: true } },
      },
    });

    if (!poll || poll.feedEvent.tenantId !== tenant.id) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    if (!poll.options.some((o) => o.id === optionId)) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }

    const existing = await prisma.pollVote.findUnique({
      where: { pollId_userId: { pollId, userId } },
    });

    if (existing) {
      if (existing.pollOptionId === optionId) {
        await prisma.pollVote.delete({ where: { id: existing.id } });
        return NextResponse.json({ voted: null });
      }
      await prisma.pollVote.update({
        where: { id: existing.id },
        data: { pollOptionId: optionId },
      });
      return NextResponse.json({ voted: optionId });
    }

    await prisma.pollVote.create({
      data: { pollId, pollOptionId: optionId, userId },
    });

    return NextResponse.json({ voted: optionId });
  } catch (error) {
    console.error("POST /api/feed/[eventId]/polls/[pollId]/vote error:", error);
    return NextResponse.json({ error: "Failed to vote" }, { status: 500 });
  }
}
