import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { parseHhmm, SLOT_MINUTES } from "@/lib/availability";

interface RangePayload {
  dayOfWeek: number;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}

interface ReplaceBody {
  ranges: RangePayload[];
  studioPreferences: { studioId: string; preference: "preferred" | "ok_if_needed" }[];
}

/**
 * Atomic replace of the coach's recurring positive-availability blocks.
 *
 * The grid editor is a "set the whole picture" UI — diffing per-range
 * would be fragile and would lose information when the coach repaints a
 * region. Instead we accept the full desired state, validate it, and
 * inside one transaction:
 *   1) Delete all existing kind=availability,type=recurring blocks for this coach.
 *   2) Recreate the desired blocks with the supplied studio preferences.
 *
 * Time-off blocks and one-time availability are untouched — this route
 * is scoped to the recurring-availability layer that the grid edits.
 */
export async function PUT(request: NextRequest) {
  try {
    const { session, tenant } = await requireRole("COACH");
    const body = (await request.json()) as ReplaceBody;

    if (!Array.isArray(body.ranges)) {
      return NextResponse.json({ error: "ranges debe ser un arreglo" }, { status: 400 });
    }
    if (!Array.isArray(body.studioPreferences)) {
      return NextResponse.json(
        { error: "studioPreferences debe ser un arreglo" },
        { status: 400 },
      );
    }

    const openMin = parseHhmm(tenant.studioOpenTime);
    const closeMin = parseHhmm(tenant.studioCloseTime);
    if (openMin == null || closeMin == null) {
      return NextResponse.json({ error: "Configuración del estudio inválida" }, { status: 500 });
    }
    const operatingDays = new Set(tenant.operatingDays);

    // Validate every range up-front so a malformed entry doesn't leave us
    // with the existing blocks deleted and nothing in their place.
    for (const r of body.ranges) {
      if (!Number.isInteger(r.dayOfWeek) || r.dayOfWeek < 0 || r.dayOfWeek > 6) {
        return NextResponse.json({ error: "dayOfWeek inválido" }, { status: 400 });
      }
      if (!operatingDays.has(r.dayOfWeek)) {
        return NextResponse.json(
          { error: `El día ${r.dayOfWeek} no es operativo del estudio` },
          { status: 400 },
        );
      }
      const sm = parseHhmm(r.startTime);
      const em = parseHhmm(r.endTime);
      if (sm == null || em == null) {
        return NextResponse.json({ error: "Horario inválido" }, { status: 400 });
      }
      if (sm % SLOT_MINUTES !== 0 || em % SLOT_MINUTES !== 0) {
        return NextResponse.json(
          { error: `Los horarios deben estar en intervalos de ${SLOT_MINUTES} minutos` },
          { status: 400 },
        );
      }
      if (em <= sm) {
        return NextResponse.json(
          { error: "La hora final debe ser mayor a la inicial" },
          { status: 400 },
        );
      }
      if (sm < openMin || em > closeMin) {
        return NextResponse.json(
          {
            error: `El horario debe estar dentro de ${tenant.studioOpenTime}–${tenant.studioCloseTime}`,
          },
          { status: 400 },
        );
      }
    }

    // Validate studio preferences.
    const tenantStudios = await prisma.studio.findMany({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    const validStudioIds = new Set(tenantStudios.map((s) => s.id));
    const seenStudio = new Set<string>();
    for (const p of body.studioPreferences) {
      if (!validStudioIds.has(p.studioId)) {
        return NextResponse.json({ error: "Estudio inválido" }, { status: 400 });
      }
      if (seenStudio.has(p.studioId)) {
        return NextResponse.json(
          { error: "Un estudio no puede aparecer dos veces" },
          { status: 400 },
        );
      }
      seenStudio.add(p.studioId);
      if (p.preference !== "preferred" && p.preference !== "ok_if_needed") {
        return NextResponse.json({ error: "Preferencia inválida" }, { status: 400 });
      }
    }

    // Single-studio tenants: auto-apply preferred for the only studio if the
    // client didn't send anything, so the grid UI can skip the prefs picker.
    let studioPreferences = body.studioPreferences;
    if (studioPreferences.length === 0 && tenantStudios.length === 1) {
      studioPreferences = [{ studioId: tenantStudios[0].id, preference: "preferred" }];
    }

    if (body.ranges.length > 0 && studioPreferences.length === 0) {
      return NextResponse.json(
        { error: "Debes elegir al menos un estudio" },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.coachAvailabilityBlock.deleteMany({
        where: {
          tenantId: tenant.id,
          coachId: session.user.id,
          kind: "availability",
          type: "recurring",
        },
      });

      for (const r of body.ranges) {
        await tx.coachAvailabilityBlock.create({
          data: {
            tenantId: tenant.id,
            coachId: session.user.id,
            kind: "availability",
            type: "recurring",
            dayOfWeek: [r.dayOfWeek],
            startTime: r.startTime,
            endTime: r.endTime,
            isAllDay: false,
            status: "active",
            studioPreferences: {
              create: studioPreferences.map((p) => ({
                studioId: p.studioId,
                preference: p.preference,
                tenantId: tenant.id,
              })),
            },
          },
        });
      }
    });

    return NextResponse.json({ ok: true, created: body.ranges.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to replace recurring availability";
    console.error("PUT /api/coaches/availability/recurring error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
