import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const profile = await prisma.coachProfile.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });

    if (!profile) {
      return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
    }

    if (!profile.userId) {
      return NextResponse.json({ error: "Este coach no tiene cuenta vinculada" }, { status: 400 });
    }

    const userId = profile.userId;

    await prisma.$transaction(async (tx) => {
      await tx.coachProfile.update({
        where: { id },
        data: { userId: null },
      });

      const membership = await tx.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId: ctx.tenant.id } },
      });
      if (membership) {
        await tx.membership.update({
          where: { id: membership.id },
          data: { role: "CLIENT" },
        });
      }
    });

    const updated = await prisma.coachProfile.findFirst({
      where: { id, tenantId: ctx.tenant.id },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("POST /api/admin/coaches/[id]/unlink error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
