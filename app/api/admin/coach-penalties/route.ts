import { NextRequest, NextResponse } from "next/server";
import { CoachPenaltyType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole, requirePermission, getTenantCurrency } from "@/lib/tenant";
import { penaltyInclude, serializePenalty } from "@/lib/coach/penalties";

const VALID_TYPES = new Set<string>(["LATE_ARRIVAL", "LATE_ENDING", "OTHER"]);

// GET /api/admin/coach-penalties?coachId=X — a coach's penalties (newest first).
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("coaches");
    const coachId = request.nextUrl.searchParams.get("coachId");
    if (!coachId) {
      return NextResponse.json({ error: "coachId is required" }, { status: 400 });
    }

    const penalties = await prisma.coachPenalty.findMany({
      where: { tenantId: ctx.tenant.id, coachProfileId: coachId },
      include: penaltyInclude,
      orderBy: { occurredAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ penalties: penalties.map(serializePenalty) });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("GET /api/admin/coach-penalties error:", error);
    return NextResponse.json({ error: "Failed to load penalties" }, { status: 500 });
  }
}

// POST /api/admin/coach-penalties — log a penalty against a class's instructor.
// Registered from the check-in screen, so it takes the classId and resolves the
// coach + timing from the class.
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const body = await request.json();
    const { classId, type, note, amountCents } = body ?? {};

    if (!classId || typeof classId !== "string") {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }
    if (!type || !VALID_TYPES.has(String(type))) {
      return NextResponse.json({ error: "Tipo de penalidad inválido" }, { status: 400 });
    }
    const trimmedNote = typeof note === "string" ? note.trim() : "";
    if (type === "OTHER" && !trimmedNote) {
      return NextResponse.json(
        { error: "Describe la penalidad en la nota" },
        { status: 400 },
      );
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      select: { id: true, coachId: true, startsAt: true },
    });
    if (!cls) {
      return NextResponse.json({ error: "Clase no encontrada" }, { status: 404 });
    }

    let amount: number | null = null;
    let currency: string | null = null;
    if (amountCents != null && amountCents !== "") {
      const n = Math.round(Number(amountCents));
      if (Number.isFinite(n) && n > 0) {
        amount = n;
        currency = (await getTenantCurrency()).code;
      }
    }

    const created = await prisma.coachPenalty.create({
      data: {
        tenantId: ctx.tenant.id,
        coachProfileId: cls.coachId,
        classId: cls.id,
        type: type as CoachPenaltyType,
        note: trimmedNote || null,
        amountCents: amount,
        currency,
        occurredAt: cls.startsAt,
        createdById: ctx.session.user.id,
      },
      include: penaltyInclude,
    });

    return NextResponse.json(serializePenalty(created), { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/admin/coach-penalties error:", error);
    return NextResponse.json({ error: "Failed to create penalty" }, { status: 500 });
  }
}
