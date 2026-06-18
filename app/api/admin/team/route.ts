import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { sendRoleInvitation } from "@/lib/email";
import {
  getEffectivePermissions,
  parsePermissionOverride,
} from "@/lib/permissions";

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");

    const memberships = await prisma.membership.findMany({
      where: { tenantId: ctx.tenant.id, role: { in: ["ADMIN", "FRONT_DESK"] } },
      include: {
        user: { select: { id: true, name: true, email: true, image: true, createdAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const admins = memberships.map((m) => ({
      ...m.user,
      role: m.role,
      // Raw override (null = role defaults) + the resolved effective set so the
      // UI can render toggles and show whether this member is customized.
      permissionsOverride: parsePermissionOverride(m.permissions),
      permissions: getEffectivePermissions(m),
    }));

    return NextResponse.json(admins);
  } catch (error) {
    console.error("GET /api/admin/team error:", error);
    const msg = error instanceof Error ? error.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireRole("ADMIN");

  const { email, name, role: requestedRole } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const trimmedName = typeof name === "string" ? name.trim() : null;
  const targetRole = requestedRole === "FRONT_DESK" ? "FRONT_DESK" as const : "ADMIN" as const;

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { memberships: { where: { tenantId: ctx.tenant.id } } },
  });

  if (existing) {
    const membership = existing.memberships[0];

    if (membership?.role === "ADMIN") {
      return NextResponse.json(
        { error: "Este usuario ya es administrador" },
        { status: 409 },
      );
    }

    if (membership?.role === "CLIENT") {
      return NextResponse.json(
        {
          error: `Ya existe un cliente con este correo (${existing.name || normalizedEmail}). ¿Deseas convertirlo en admin?`,
          existingUser: { id: existing.id, name: existing.name, email: existing.email },
          requireConfirm: true,
        },
        { status: 409 },
      );
    }

    if (membership?.role === "COACH") {
      return NextResponse.json(
        {
          error: `Este correo pertenece a un coach (${existing.name || normalizedEmail}). ¿Deseas convertirlo en admin?`,
          existingUser: { id: existing.id, name: existing.name, email: existing.email },
          requireConfirm: true,
        },
        { status: 409 },
      );
    }

    if (!membership) {
      await prisma.membership.create({
        data: { userId: existing.id, tenantId: ctx.tenant.id, role: targetRole },
      });
    }

    if (trimmedName && !existing.name) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: trimmedName },
      });
    }

    const origin = request.nextUrl.origin;
    await sendRoleInvitation({
      to: normalizedEmail,
      role: targetRole,
      invitedBy: ctx.session.user.name || "Un administrador",
      origin,
    });

    return NextResponse.json(
      { id: existing.id, name: trimmedName || existing.name, email: existing.email, image: existing.image, createdAt: existing.createdAt },
      { status: 200 },
    );
  }

  const user = await prisma.user.create({
    data: { email: normalizedEmail, ...(trimmedName && { name: trimmedName }) },
    select: { id: true, name: true, email: true, image: true, createdAt: true },
  });

  await prisma.membership.create({
    data: { userId: user.id, tenantId: ctx.tenant.id, role: targetRole },
  });

  const origin = request.nextUrl.origin;
  await sendRoleInvitation({
    to: normalizedEmail,
    role: targetRole,
    invitedBy: ctx.session.user.name || "Un administrador",
    origin,
  });

  return NextResponse.json(user, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const ctx = await requireRole("ADMIN");

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  }

  await prisma.membership.upsert({
    where: { userId_tenantId: { userId, tenantId: ctx.tenant.id } },
    create: { userId, tenantId: ctx.tenant.id, role: "ADMIN" },
    update: { role: "ADMIN" },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, createdAt: true },
  });

  const origin = request.nextUrl.origin;
  await sendRoleInvitation({
    to: user!.email,
    role: "ADMIN",
    invitedBy: ctx.session.user.name || "Un administrador",
    origin,
  });

  return NextResponse.json(user);
}

// Set a team member's granular permission override. `permissions: null` resets
// to the role default (full admin / front-desk operational set).
export async function PATCH(request: NextRequest) {
  const ctx = await requireRole("ADMIN");

  const { userId, permissions } = await request.json();
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  }
  // Guard against self-lockout: an admin can't restrict their own access.
  if (userId === ctx.session.user.id) {
    return NextResponse.json(
      { error: "No puedes modificar tus propios permisos" },
      { status: 400 },
    );
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId: ctx.tenant.id } },
    select: { role: true },
  });
  if (!membership || !["ADMIN", "FRONT_DESK"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Miembro de equipo no encontrado" },
      { status: 404 },
    );
  }

  // null → reset to role default; array → explicit allow-list (validated).
  const override =
    permissions === null ? null : parsePermissionOverride(permissions);
  if (permissions !== null && override === null) {
    return NextResponse.json(
      { error: "permissions debe ser un arreglo o null" },
      { status: 400 },
    );
  }

  await prisma.membership.update({
    where: { userId_tenantId: { userId, tenantId: ctx.tenant.id } },
    data: { permissions: override === null ? Prisma.DbNull : override },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireRole("ADMIN");

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  }

  if (userId === ctx.session.user.id) {
    return NextResponse.json(
      { error: "No puedes removerte a ti mismo como admin" },
      { status: 400 },
    );
  }

  await prisma.membership.update({
    where: { userId_tenantId: { userId, tenantId: ctx.tenant.id } },
    data: { role: "CLIENT" },
  });

  return NextResponse.json({ success: true });
}
