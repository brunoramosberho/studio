import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const ctx = await requireRole("ADMIN");
  const body = await req.json();
  const { requireResign } = body as { requireResign?: boolean };

  const draft = await prisma.waiver.findFirst({
    where: { tenantId: ctx.tenant.id, status: "draft" },
  });

  if (!draft) {
    return NextResponse.json({ error: "No draft to publish" }, { status: 404 });
  }

  if (!draft.content?.trim()) {
    return NextResponse.json(
      { error: "El waiver no puede estar vacío" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    // Deactivate current active waiver(s)
    await tx.waiver.updateMany({
      where: { tenantId: ctx.tenant.id, status: "active" },
      data: { status: "draft" },
    });

    // Activate the draft
    await tx.waiver.update({
      where: { id: draft.id },
      data: {
        status: "active",
        publishedAt: new Date(),
        publishedBy: ctx.session.user.id,
      },
    });

    // If requireResign, delete old signatures so members must re-sign
    if (requireResign) {
      await tx.waiverSignature.deleteMany({
        where: {
          tenantId: ctx.tenant.id,
          waiverVersion: { lt: draft.version },
        },
      });
    }
  });

  return NextResponse.json({ success: true, version: draft.version });
}
