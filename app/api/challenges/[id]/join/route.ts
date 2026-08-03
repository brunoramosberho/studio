import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

/**
 * Join the live challenge. Enrolling does NOT start the member's window —
 * their first attended class does — so there's no penalty for signing up on
 * day one and coming later in the week.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { id } = await params;

    const challenge = await prisma.challenge.findFirst({
      where: { id, tenantId: tenant.id },
      select: { id: true, status: true, enrollOpensAt: true, enrollClosesAt: true },
    });
    if (!challenge) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (challenge.status !== "ACTIVE") {
      return NextResponse.json({ error: "not_active" }, { status: 400 });
    }

    const now = new Date();
    if (now < challenge.enrollOpensAt || now > challenge.enrollClosesAt) {
      return NextResponse.json({ error: "enrollment_closed" }, { status: 400 });
    }

    // Unique on (challengeId, userId), so a double tap is a no-op.
    const participant = await prisma.challengeParticipant.upsert({
      where: { challengeId_userId: { challengeId: challenge.id, userId: session.user.id } },
      create: {
        challengeId: challenge.id,
        userId: session.user.id,
        tenantId: tenant.id,
      },
      update: {},
    });

    return NextResponse.json({ participantId: participant.id }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Not a member of this studio", "Tenant not found"].includes(
        error.message,
      )
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/challenges/[id]/join error:", error);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
