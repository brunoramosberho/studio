import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { purgeInertClasses } from "@/lib/classes/inert";
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
    select: { id: true, userId: true },
  });

  if (!profile) {
    return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
  }

  // Classes hold the coach with a restricting key, so a single leftover row
  // blocks the delete — including a class that was scheduled and emptied and
  // now exists only as a cancelled shell. Clear those first, same as removing
  // a discipline or a room does.
  const classIds = (
    await prisma.class.findMany({
      where: {
        tenantId: ctx.tenant.id,
        OR: [{ coachId: coachProfileId }, { originalCoachId: coachProfileId }],
      },
      select: { id: true },
    })
  ).map((c) => c.id);
  await purgeInertClasses(classIds);

  // Whatever still points here is real. Say which it is: this used to be an
  // unhandled foreign-key error, so the studio saw a 500 and no reason.
  const [classes, availability, substitutions] = await Promise.all([
    prisma.class.count({
      where: {
        tenantId: ctx.tenant.id,
        OR: [{ coachId: coachProfileId }, { originalCoachId: coachProfileId }],
      },
    }),
    prisma.coachAvailabilityBlock.count({ where: { coachId: coachProfileId } }),
    prisma.substitutionRequest.count({
      where: {
        OR: [
          { requestingCoachId: coachProfileId },
          { originalCoachId: coachProfileId },
          { targetCoachId: coachProfileId },
          { acceptedByCoachId: coachProfileId },
        ],
      },
    }),
  ]);

  if (classes > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: tiene ${classes} clase(s) asignada(s)` },
      { status: 409 },
    );
  }
  if (substitutions > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: aparece en ${substitutions} solicitud(es) de sustitución` },
      { status: 409 },
    );
  }
  if (availability > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: tiene ${availability} bloque(s) de disponibilidad` },
      { status: 409 },
    );
  }

  try {
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
  } catch (error) {
    // The checks above cover what points at a coach today. A relation added
    // later would land here instead of as a bare 500 with nothing to act on.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        { error: "No se puede eliminar: el coach todavía está en uso en otra parte del sistema" },
        { status: 409 },
      );
    }
    console.error("DELETE /api/admin/coaches error:", error);
    return NextResponse.json({ error: "No se pudo eliminar el coach" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
