import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { sendRoleInvitation } from "@/lib/email";

export async function POST(request: NextRequest) {
  const ctx = await requireRole("ADMIN");

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : null;

  if (!name) {
    return NextResponse.json({ error: "Nombre es requerido" }, { status: 400 });
  }

  const origin = request.nextUrl.origin;

  if (!email) {
    const coach = await prisma.coachProfile.create({
      data: { name, tenantId: ctx.tenant.id },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });
    return NextResponse.json(coach, { status: 201 });
  }

  const existing = await prisma.user.findUnique({
    where: { email },
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

  if (existing) {
    await prisma.$transaction(async (tx) => {
      if (!existing.coachProfiles?.length) {
        await tx.coachProfile.create({
          data: { name, userId: existing.id, tenantId: ctx.tenant.id },
        });
      } else {
        await tx.coachProfile.update({
          where: { id: existing.coachProfiles[0].id },
          data: { name },
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
      to: email,
      role: "COACH",
      invitedBy: ctx.session.user.name || "Un administrador",
      origin,
    });

    const coach = await prisma.coachProfile.findFirst({
      where: { userId: existing.id, tenantId: ctx.tenant.id },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });

    return NextResponse.json(coach, { status: 200 });
  }

  const user = await prisma.user.create({
    data: { email, name },
  });

  const [coach] = await prisma.$transaction([
    prisma.coachProfile.create({
      data: { name, userId: user.id, tenantId: ctx.tenant.id },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    }),
    prisma.membership.create({
      data: { userId: user.id, tenantId: ctx.tenant.id, role: "COACH" },
    }),
  ]);

  await sendRoleInvitation({
    to: email,
    role: "COACH",
    invitedBy: ctx.session.user.name || "Un administrador",
    origin,
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
    if (profile.userId) {
      const membership = await tx.membership.findUnique({
        where: { userId_tenantId: { userId: profile.userId, tenantId: ctx.tenant.id } },
      });
      if (membership) {
        await tx.membership.update({
          where: { id: membership.id },
          data: { role: "CLIENT" },
        });
      }
    }
  });

  return NextResponse.json({ success: true });
}
