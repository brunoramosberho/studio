import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const ctx = await requireRole("ADMIN");
  const body = await req.json();
  const { requireResign } = body as { requireResign?: boolean };

  const latest = await prisma.waiver.findFirst({
    where: { tenantId: ctx.tenant.id },
    orderBy: { version: "desc" },
  });

  if (!latest) {
    return NextResponse.json(
      { error: "No hay waiver creado" },
      { status: 404 },
    );
  }

  if (latest.status === "active") {
    return NextResponse.json(
      { error: "El waiver ya está publicado. Si hiciste cambios, ya están activos." },
      { status: 409 },
    );
  }

  if (!latest.content?.trim()) {
    return NextResponse.json(
      { error: "El waiver no puede estar vacío" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.waiver.updateMany({
      where: { tenantId: ctx.tenant.id, status: "active" },
      data: { status: "draft" },
    });

    await tx.waiver.update({
      where: { id: latest.id },
      data: {
        status: "active",
        publishedAt: new Date(),
        publishedBy: ctx.session.user.id,
      },
    });

    if (requireResign) {
      await tx.waiverSignature.deleteMany({
        where: {
          tenantId: ctx.tenant.id,
          waiverVersion: { lt: latest.version },
        },
      });
    }
  });

  return NextResponse.json({ success: true, version: latest.version });
}
