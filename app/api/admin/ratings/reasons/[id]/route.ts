import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePermission("ratings");
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.ratingReason.findFirst({
      where: { id, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Motivo no encontrado" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.text === "string") {
      const text = body.text.trim();
      if (!text || text.length > 60) {
        return NextResponse.json({ error: "Texto inválido (1–60 caracteres)" }, { status: 400 });
      }
      data.text = text;
    }
    if (typeof body.emoji === "string") data.emoji = body.emoji.trim() || "💬";
    if (typeof body.active === "boolean") data.active = body.active;
    if (typeof body.order === "number") data.order = body.order;

    const updated = await prisma.ratingReason.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("PATCH /api/admin/ratings/reasons/[id] error:", error);
    return NextResponse.json({ error: "Failed to update reason" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePermission("ratings");
    const { id } = await params;
    // deleteMany doubles as the tenant guard — a foreign id deletes nothing.
    const res = await prisma.ratingReason.deleteMany({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (res.count === 0) {
      return NextResponse.json({ error: "Motivo no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("DELETE /api/admin/ratings/reasons/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete reason" }, { status: 500 });
  }
}
