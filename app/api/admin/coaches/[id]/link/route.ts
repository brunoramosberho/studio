import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { sendRoleInvitation } from "@/lib/email";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const profile = await prisma.coachProfile.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });

    if (!profile) {
      return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
    }

    if (profile.userId) {
      return NextResponse.json({ error: "Este coach ya tiene una cuenta vinculada" }, { status: 409 });
    }

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        coachProfiles: { where: { tenantId: ctx.tenant.id } },
        memberships: { where: { tenantId: ctx.tenant.id } },
      },
    });

    if (user?.coachProfiles?.length) {
      return NextResponse.json(
        { error: "Este email ya está vinculado a otro coach en este estudio" },
        { status: 409 },
      );
    }

    if (!user) {
      user = await prisma.user.create({
        data: { email: normalizedEmail, name: profile.name },
        include: {
          coachProfiles: { where: { tenantId: ctx.tenant.id } },
          memberships: { where: { tenantId: ctx.tenant.id } },
        },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.coachProfile.update({
        where: { id },
        data: { userId: user.id },
      });

      const existingMembership = user.memberships[0];
      if (existingMembership) {
        await tx.membership.update({
          where: { id: existingMembership.id },
          data: { role: "COACH" },
        });
      } else {
        await tx.membership.create({
          data: { userId: user.id, tenantId: ctx.tenant.id, role: "COACH" },
        });
      }
    });

    const origin = request.nextUrl.origin;
    await sendRoleInvitation({
      to: normalizedEmail,
      role: "COACH",
      invitedBy: ctx.session.user.name || "Un administrador",
      origin,
    });

    const updated = await prisma.coachProfile.findFirst({
      where: { id, tenantId: ctx.tenant.id },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("POST /api/admin/coaches/[id]/link error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
