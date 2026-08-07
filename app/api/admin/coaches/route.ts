import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { purgeInertClasses } from "@/lib/classes/inert";
import { planCoachRemoval } from "@/lib/coach/archive";
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

/**
 * What removing this instructor would do. The dialog asks before acting so the
 * studio reads the outcome — deleted, archived, or refused — before choosing.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireRole("ADMIN");
  const params = request.nextUrl.searchParams;

  // Archived instructors are hidden everywhere else on purpose, so this is the
  // one place they can be found again — without it a studio would re-create a
  // duplicate profile rather than restore the original.
  if (params.get("archived") === "1") {
    const archived = await prisma.coachProfile.findMany({
      where: { tenantId: ctx.tenant.id, archivedAt: { not: null } },
      select: {
        id: true,
        name: true,
        photoUrl: true,
        archivedAt: true,
        user: { select: { email: true, image: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(archived);
  }

  const coachProfileId = params.get("coachProfileId");
  if (!coachProfileId) {
    return NextResponse.json({ error: "coachProfileId requerido" }, { status: 400 });
  }

  const profile = await prisma.coachProfile.findFirst({
    where: { id: coachProfileId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    name: profile.name,
    archived: profile.archivedAt != null,
    ...(await planCoachRemoval(coachProfileId, ctx.tenant.id)),
  });
}

/** Restore an archived instructor. */
export async function PATCH(request: NextRequest) {
  const ctx = await requireRole("ADMIN");
  const { coachProfileId, archived, pinned } = await request.json();
  if (!coachProfileId) {
    return NextResponse.json({ error: "coachProfileId requerido" }, { status: 400 });
  }

  // Pinning is a separate, smaller edit: it moves the instructor to the front
  // of the schedule strip without touching whether they are archived.
  if (typeof pinned === "boolean") {
    await prisma.coachProfile.updateMany({
      where: { id: coachProfileId, tenantId: ctx.tenant.id },
      data: { displayOrder: pinned ? 0 : null },
    });
    return NextResponse.json({ success: true, pinned });
  }

  if (typeof archived !== "boolean") {
    return NextResponse.json(
      { error: "archived o pinned son requeridos" },
      { status: 400 },
    );
  }

  const profile = await prisma.coachProfile.findFirst({
    where: { id: coachProfileId, tenantId: ctx.tenant.id },
    select: { id: true, userId: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.coachProfile.update({
      where: { id: coachProfileId },
      data: { archivedAt: archived ? new Date() : null },
    });
    // Archiving closes the coach portal; restoring reopens it. The role is the
    // gate (lib/staff-access.ts), so there is nothing else to toggle.
    if (profile.userId) {
      await tx.membership.updateMany({
        where: { userId: profile.userId, tenantId: ctx.tenant.id },
        data: { role: archived ? "CLIENT" : "COACH" },
      });
    }
  });

  return NextResponse.json({ success: true, archived });
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

  // Recomputed rather than trusting whatever the dialog was told: the plan may
  // be seconds old, and a class booked in between must still win.
  const plan = await planCoachRemoval(coachProfileId, ctx.tenant.id);

  if (plan.outcome === "blocked") {
    return NextResponse.json(
      {
        error: `Tiene ${plan.futureClasses} clase(s) próxima(s). Reasígnalas antes de quitarla.`,
        plan,
      },
      { status: 409 },
    );
  }

  if (plan.outcome === "archive") {
    await prisma.$transaction(async (tx) => {
      await tx.coachProfile.update({
        where: { id: coachProfileId },
        data: { archivedAt: new Date() },
      });
      if (profile.userId) {
        await tx.membership.updateMany({
          where: { userId: profile.userId, tenantId: ctx.tenant.id },
          data: { role: "CLIENT" },
        });
      }
    });
    return NextResponse.json({ success: true, outcome: "archive", plan });
  }

  // Nothing points here, so the classes left are empty shells from scheduling
  // that never happened. Clear them and remove the profile for real.
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
    // The plan covers what points at a coach today. A relation added later
    // would land here instead of as a bare 500 with nothing to act on.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        { error: "No se puede eliminar: el coach todavía está en uso en otra parte del sistema" },
        { status: 409 },
      );
    }
    console.error("DELETE /api/admin/coaches error:", error);
    return NextResponse.json({ error: "No se pudo eliminar el coach" }, { status: 500 });
  }

  return NextResponse.json({ success: true, outcome: "delete" });
}
