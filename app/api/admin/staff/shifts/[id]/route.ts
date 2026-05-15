import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffManagement } from "../../_auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { id } = await params;

    const existing = await prisma.staffShift.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const { clockInAt, clockOutAt, studioId, notes, status, reason } = body ?? {};

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return NextResponse.json(
        { error: "Debes indicar una razón para editar el turno" },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      status: status ?? "EDITED",
      editedById: ctx.session.user?.id ?? null,
      editReason: reason,
      editedAt: new Date(),
    };

    let inAt = existing.clockInAt;
    let outAt = existing.clockOutAt;

    if (clockInAt) {
      inAt = new Date(clockInAt);
      updates.clockInAt = inAt;
    }
    if (clockOutAt !== undefined) {
      outAt = clockOutAt ? new Date(clockOutAt) : null;
      updates.clockOutAt = outAt;
    }
    if (studioId) {
      const s = await prisma.studio.findFirst({
        where: { id: studioId, tenantId: ctx.tenant.id },
        select: { id: true },
      });
      if (!s) return NextResponse.json({ error: "Estudio inválido" }, { status: 400 });
      updates.studioId = studioId;
    }
    if (notes !== undefined) updates.notes = notes || null;

    if (inAt && outAt) {
      if (outAt <= inAt) {
        return NextResponse.json(
          { error: "El clock-out debe ser posterior al clock-in" },
          { status: 400 },
        );
      }
      updates.durationMinutes = Math.round((outAt.getTime() - inAt.getTime()) / 60_000);
    }

    const updated = await prisma.staffShift.update({
      where: { id },
      data: updates,
      include: { studio: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH shift error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// Void a shift (e.g. accidental clock-in). Excluded from payroll; preserved
// for audit. We don't hard-delete to keep the history honest.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { id } = await params;
    const url = new URL(request.url);
    const reason = url.searchParams.get("reason");

    if (!reason || reason.trim().length < 3) {
      return NextResponse.json(
        { error: "Razón requerida (?reason=...)" },
        { status: 400 },
      );
    }

    const existing = await prisma.staffShift.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.staffShift.update({
      where: { id },
      data: {
        status: "VOIDED",
        editedById: ctx.session.user?.id ?? null,
        editReason: reason,
        editedAt: new Date(),
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE shift error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
