import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { resolveScheduleTimezone } from "@/lib/schedule/visibility";
import { zonedWallTimeToUtc } from "@/lib/utils";
import {
  ChallengeInputError,
  challengeEndsAt,
  parseChallengeInput,
  toChallengeData,
} from "@/lib/challenges/input";

/**
 * Turn a "YYYY-MM-DD" from the form into an instant in the studio's timezone.
 * A challenge that opens "on the 1st" must open at midnight in Madrid or CDMX,
 * not wherever the admin's laptop happens to be.
 */
function dayStartFactory(timezone: string) {
  return (date: string, endOfDay: boolean): Date => {
    const [y, m, d] = date.split("-").map(Number);
    return endOfDay
      ? zonedWallTimeToUtc(y, m - 1, d, 23, 59, timezone)
      : zonedWallTimeToUtc(y, m - 1, d, 0, 0, timezone);
  };
}

export async function GET() {
  try {
    const { tenant } = await requirePermission("achievements");

    const challenges = await prisma.challenge.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { participants: true } },
      },
    });

    const studios = await prisma.studio.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      challenges: challenges.map((c) => ({
        ...c,
        participantCount: c._count.participants,
        endsAt: challengeEndsAt(c.enrollClosesAt, c.durationDays),
      })),
      studios,
    });
  } catch (error) {
    return handleError(error, "GET /api/admin/challenges");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requirePermission("achievements");
    const body = await request.json();

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

    const challenge = await prisma.challenge.create({
      data: { ...toChallengeData(input), tenantId: tenant.id, status: "DRAFT" },
    });

    return NextResponse.json(challenge, { status: 201 });
  } catch (error) {
    return handleError(error, "POST /api/admin/challenges");
  }
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
