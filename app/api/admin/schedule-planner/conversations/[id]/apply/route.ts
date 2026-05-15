import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { ScheduleProposal } from "@/lib/ai/schedule-planner/types";

interface ApplyBody {
  // Optional admin edits to the saved proposal. When omitted, applies the
  // proposal as Spark generated it.
  classes?: {
    classTypeId: string;
    coachId: string;
    roomId: string;
    startsAt: string;
    endsAt: string;
  }[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireRole("ADMIN");
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as ApplyBody;

    const conv = await prisma.schedulePlanConversation.findFirst({
      where: {
        id,
        tenantId: auth.tenant.id,
        adminUserId: auth.session.user.id,
      },
    });
    if (!conv) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const proposal = conv.proposalJson as ScheduleProposal | null;
    if (!proposal && (!body.classes || body.classes.length === 0)) {
      return NextResponse.json(
        { error: "No hay propuesta para aplicar" },
        { status: 400 },
      );
    }

    const source =
      body.classes && body.classes.length > 0
        ? body.classes
        : proposal!.classes.map((c) => ({
            classTypeId: c.classTypeId,
            coachId: c.coachId,
            roomId: c.roomId,
            startsAt: c.startsAt,
            endsAt: c.endsAt,
          }));

    if (source.length > 200) {
      return NextResponse.json(
        { error: "Máximo 200 clases por aplicación" },
        { status: 400 },
      );
    }

    // Validate that every id still belongs to this tenant — guards against a
    // stale proposal referencing deleted entities.
    const classTypeIds = unique(source.map((s) => s.classTypeId));
    const coachIds = unique(source.map((s) => s.coachId));
    const roomIds = unique(source.map((s) => s.roomId));

    const [classTypeCount, coachCount, roomCount] = await Promise.all([
      prisma.classType.count({
        where: { tenantId: auth.tenant.id, id: { in: classTypeIds } },
      }),
      prisma.coachProfile.count({
        where: { tenantId: auth.tenant.id, id: { in: coachIds } },
      }),
      prisma.room.count({
        where: { tenantId: auth.tenant.id, id: { in: roomIds } },
      }),
    ]);
    if (classTypeCount !== classTypeIds.length) {
      return NextResponse.json(
        { error: "La propuesta contiene disciplinas que ya no existen" },
        { status: 400 },
      );
    }
    if (coachCount !== coachIds.length) {
      return NextResponse.json(
        { error: "La propuesta contiene coaches que ya no existen" },
        { status: 400 },
      );
    }
    if (roomCount !== roomIds.length) {
      return NextResponse.json(
        { error: "La propuesta contiene salas que ya no existen" },
        { status: 400 },
      );
    }

    const recurringId = crypto.randomUUID();
    const created: { id: string; startsAt: Date }[] = [];
    const failures: { index: number; reason: string }[] = [];

    // Sequential to surface per-class errors. 200 max keeps total within
    // request budget.
    for (let i = 0; i < source.length; i++) {
      const cls = source[i];
      try {
        const startsAt = new Date(cls.startsAt);
        const endsAt = new Date(cls.endsAt);
        if (
          Number.isNaN(startsAt.getTime()) ||
          Number.isNaN(endsAt.getTime()) ||
          endsAt <= startsAt
        ) {
          failures.push({ index: i, reason: "Fechas inválidas" });
          continue;
        }
        const newClass = await prisma.class.create({
          data: {
            tenantId: auth.tenant.id,
            classTypeId: cls.classTypeId,
            coachId: cls.coachId,
            roomId: cls.roomId,
            startsAt,
            endsAt,
            isRecurring: true,
            recurringId,
          },
          select: { id: true, startsAt: true },
        });
        created.push(newClass);
      } catch (err) {
        failures.push({
          index: i,
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    await prisma.schedulePlanConversation.update({
      where: { id: conv.id },
      data: {
        status: "APPLIED",
        appliedClassIds: created.map((c) => c.id),
      },
    });

    return NextResponse.json({
      success: failures.length === 0,
      created: created.length,
      failed: failures.length,
      total: source.length,
      recurringId,
      failures,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = ["Unauthorized"].includes(message)
      ? 401
      : ["Forbidden", "Not a member of this studio"].includes(message)
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
