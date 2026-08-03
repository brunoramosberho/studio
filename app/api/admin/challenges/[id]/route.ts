import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/tenant";
import { resolveScheduleTimezone } from "@/lib/schedule/visibility";
import { zonedWallTimeToUtc } from "@/lib/utils";
import {
  ChallengeInputError,
  challengeEndsAt,
  parseChallengeInput,
  toChallengeData,
  type Prize,
} from "@/lib/challenges/input";
import { daysElapsed } from "@/lib/challenges/engine";
import { pace } from "@/lib/challenges/scoring";

function dayStartFactory(timezone: string) {
  return (date: string, endOfDay: boolean): Date => {
    const [y, m, d] = date.split("-").map(Number);
    return endOfDay
      ? zonedWallTimeToUtc(y, m - 1, d, 23, 59, timezone)
      : zonedWallTimeToUtc(y, m - 1, d, 0, 0, timezone);
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requirePermission("achievements");
    const { id } = await params;

    const challenge = await prisma.challenge.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        participants: {
          orderBy: [{ totalPoints: "desc" }, { classesCount: "desc" }],
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    });
    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...challenge,
      endsAt: challengeEndsAt(challenge.enrollClosesAt, challenge.durationDays),
      participants: challenge.participants.map((p) => {
        const elapsed = daysElapsed(p);
        return {
          id: p.id,
          user: p.user,
          joinedAt: p.joinedAt,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          totalPoints: p.totalPoints,
          classesCount: p.classesCount,
          currentStreak: p.currentStreak,
          longestStreak: p.longestStreak,
          daysElapsed: elapsed,
          pace: pace(p.totalPoints, elapsed),
        };
      }),
    });
  } catch (error) {
    return handleError(error, "GET /api/admin/challenges/[id]");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requirePermission("achievements");
    const { id } = await params;
    const body = await request.json();

    const current = await prisma.challenge.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!current) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    // Status-only changes (publish / end) come through on their own.
    if (typeof body.status === "string" && Object.keys(body).length === 1) {
      return changeStatus(current.id, tenant.id, current.status, body.status);
    }

    // Once members are competing, the scoring rules and the calendar are
    // frozen: changing them mid-challenge would mean the points already in the
    // ledger were earned under rules that no longer exist, and nobody could
    // explain a scoreboard built from both. Presentation stays editable.
    if (current.status !== "DRAFT") {
      const prizes = body.prizes === undefined ? undefined : parsePrizesOnly(body.prizes);
      const updated = await prisma.challenge.update({
        where: { id: current.id },
        data: {
          name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined,
          description:
            body.description === undefined
              ? undefined
              : typeof body.description === "string" && body.description.trim()
                ? body.description.trim()
                : null,
          ...(prizes === undefined
            ? {}
            : { prizes: prizes as unknown as Prisma.InputJsonValue }),
        },
      });
      return NextResponse.json(updated);
    }

    const timezone = await resolveScheduleTimezone(tenant);
    const input = parseChallengeInput(body, dayStartFactory(timezone));

    if (input.studioIds.length > 0) {
      const owned = await prisma.studio.count({
        where: { tenantId: tenant.id, id: { in: input.studioIds } },
      });
      if (owned !== input.studioIds.length) {
        return NextResponse.json({ error: "Unknown studio" }, { status: 400 });
      }
    }

    const updated = await prisma.challenge.update({
      where: { id: current.id },
      data: toChallengeData(input),
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleError(error, "PATCH /api/admin/challenges/[id]");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requirePermission("achievements");
    const { id } = await params;

    const challenge = await prisma.challenge.findFirst({
      where: { id, tenantId: tenant.id },
      select: { id: true, status: true },
    });
    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }
    // A published challenge is part of members' history — end it, don't erase it.
    if (challenge.status !== "DRAFT") {
      return NextResponse.json({ error: "only_draft_can_be_deleted" }, { status: 400 });
    }

    await prisma.challenge.delete({ where: { id: challenge.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, "DELETE /api/admin/challenges/[id]");
  }
}

async function changeStatus(
  id: string,
  tenantId: string,
  from: string,
  to: string,
): Promise<NextResponse> {
  if (to !== "ACTIVE" && to !== "ENDED") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (to === "ACTIVE") {
    if (from !== "DRAFT") {
      return NextResponse.json({ error: "Only a draft can be published" }, { status: 400 });
    }
    // One challenge at a time: two live scoreboards would split attention and
    // make "which one do my points count for" unanswerable.
    const live = await prisma.challenge.count({
      where: { tenantId, status: "ACTIVE", id: { not: id } },
    });
    if (live > 0) {
      return NextResponse.json({ error: "another_challenge_active" }, { status: 409 });
    }
  }
  if (to === "ENDED" && from !== "ACTIVE") {
    return NextResponse.json({ error: "Only an active challenge can be ended" }, { status: 400 });
  }

  const updated = await prisma.challenge.update({
    where: { id },
    data: { status: to },
  });
  return NextResponse.json(updated);
}

function parsePrizesOnly(raw: unknown): Prize[] {
  if (!Array.isArray(raw)) throw new ChallengeInputError("prizes must be a list");
  return raw.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const fromRank = Number(o.fromRank);
    const toRank = Number(o.toRank ?? o.fromRank);
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!Number.isInteger(fromRank) || fromRank < 1) {
      throw new ChallengeInputError("prize position must be a whole number");
    }
    if (!Number.isInteger(toRank) || toRank < fromRank) {
      throw new ChallengeInputError("a prize range must end at or after it starts");
    }
    if (!title) throw new ChallengeInputError("every prize needs a name");
    return { fromRank, toRank, title };
  });
}

function handleError(error: unknown, label: string) {
  if (error instanceof ChallengeInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (
    error instanceof Error &&
    ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(
      error.message,
    )
  ) {
    return NextResponse.json(
      { error: error.message },
      { status: error.message === "Unauthorized" ? 401 : 403 },
    );
  }
  console.error(`${label} error:`, error);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}
