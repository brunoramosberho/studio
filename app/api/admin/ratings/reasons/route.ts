import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { DEFAULT_RATING_REASONS } from "@/lib/ratings/constants";

/** Reason chips shown to members who rate low. Managed per tenant, optionally
 *  scoped to a discipline (those win over the general list for that class). */
export async function GET() {
  try {
    const ctx = await requirePermission("ratings");
    const [reasons, classTypes] = await Promise.all([
      prisma.ratingReason.findMany({
        where: { tenantId: ctx.tenant.id },
        orderBy: [{ classTypeId: "asc" }, { order: "asc" }],
        select: {
          id: true,
          text: true,
          emoji: true,
          order: true,
          active: true,
          classTypeId: true,
          classType: { select: { name: true } },
        },
      }),
      prisma.classType.findMany({
        where: { tenantId: ctx.tenant.id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return NextResponse.json({ reasons, classTypes });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/admin/ratings/reasons error:", error);
    return NextResponse.json({ error: "Failed to load reasons" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission("ratings");
    const body = await request.json();

    // One-click restore for tenants that never got the starter set.
    if (body.seedDefaults) {
      const existing = await prisma.ratingReason.findMany({
        where: { tenantId: ctx.tenant.id, classTypeId: null },
        select: { text: true },
      });
      const have = new Set(existing.map((r) => r.text.toLowerCase()));
      const missing = DEFAULT_RATING_REASONS.filter((d) => !have.has(d.text.toLowerCase()));
      if (missing.length > 0) {
        await prisma.ratingReason.createMany({
          data: missing.map((d, i) => ({
            tenantId: ctx.tenant.id,
            text: d.text,
            emoji: d.emoji,
            order: existing.length + i,
          })),
        });
      }
      return NextResponse.json({ ok: true, added: missing.length });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "El texto es obligatorio" }, { status: 400 });
    }
    if (text.length > 60) {
      return NextResponse.json({ error: "Máximo 60 caracteres" }, { status: 400 });
    }

    let classTypeId: string | null = null;
    if (body.classTypeId) {
      const ct = await prisma.classType.findFirst({
        where: { id: body.classTypeId, tenantId: ctx.tenant.id },
        select: { id: true },
      });
      if (!ct) {
        return NextResponse.json({ error: "Disciplina inválida" }, { status: 400 });
      }
      classTypeId = ct.id;
    }

    const count = await prisma.ratingReason.count({
      where: { tenantId: ctx.tenant.id, classTypeId },
    });
    const created = await prisma.ratingReason.create({
      data: {
        tenantId: ctx.tenant.id,
        classTypeId,
        text,
        emoji: emoji || "💬",
        order: count,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("POST /api/admin/ratings/reasons error:", error);
    return NextResponse.json({ error: "Failed to create reason" }, { status: 500 });
  }
}
