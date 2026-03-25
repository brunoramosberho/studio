import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { sendRoleInvitation } from "@/lib/email";

export async function POST(request: NextRequest) {
  const ctx = await requireRole("ADMIN");

  const { email } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      coachProfiles: { where: { tenantId: ctx.tenant.id } },
      memberships: { where: { tenantId: ctx.tenant.id } },
    },
  });

  if (existing?.coachProfiles?.length && existing.memberships.some((m) => m.role === "COACH")) {
    return NextResponse.json(
      { error: "Este usuario ya es coach" },
      { status: 409 },
    );
  }

  const origin = request.nextUrl.origin;

  if (existing) {
    await prisma.$transaction(async (tx) => {
      if (!existing.coachProfiles?.length) {
        await tx.coachProfile.create({
          data: { userId: existing.id, tenantId: ctx.tenant.id },
        });
      }

      const existingMembership = existing.memberships[0];
      if (existingMembership) {
        await tx.membership.update({
          where: { id: existingMembership.id },
          data: { role: "COACH" },
        });
      } else {
        await tx.membership.create({
          data: { userId: existing.id, tenantId: ctx.tenant.id, role: "COACH" },
        });
      }
    });

    await sendRoleInvitation({
      to: normalizedEmail,
      role: "COACH",
      invitedBy: ctx.session.user.name || "Un administrador",
      loginUrl: `${origin}/login`,
    });

    const coach = await prisma.coachProfile.findFirst({
      where: { userId: existing.id, tenantId: ctx.tenant.id },
      include: { user: { select: { name: true, email: true, image: true } } },
    });

    return NextResponse.json(coach, { status: 200 });
  }

  const user = await prisma.user.create({
    data: { email: normalizedEmail },
  });

  const [coach] = await prisma.$transaction([
    prisma.coachProfile.create({
      data: { userId: user.id, tenantId: ctx.tenant.id },
      include: { user: { select: { name: true, email: true, image: true } } },
    }),
    prisma.membership.create({
      data: { userId: user.id, tenantId: ctx.tenant.id, role: "COACH" },
    }),
  ]);

  await sendRoleInvitation({
    to: normalizedEmail,
    role: "COACH",
    invitedBy: ctx.session.user.name || "Un administrador",
    loginUrl: `${origin}/login`,
  });

  return NextResponse.json(coach, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireRole("ADMIN");

  const { coachProfileId } = await request.json();
  if (!coachProfileId) {
    return NextResponse.json({ error: "coachProfileId requerido" }, { status: 400 });
  }

  const profile = await prisma.coachProfile.findFirst({
    where: { id: coachProfileId, tenantId: ctx.tenant.id },
    include: { _count: { select: { classes: true } } },
  });

  if (!profile) {
    return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.coachProfile.delete({ where: { id: coachProfileId } });
    const membership = await tx.membership.findUnique({
      where: { userId_tenantId: { userId: profile.userId, tenantId: ctx.tenant.id } },
    });
    if (membership) {
      await tx.membership.update({
        where: { id: membership.id },
        data: { role: "CLIENT" },
      });
    }
  });

  return NextResponse.json({ success: true });
}
