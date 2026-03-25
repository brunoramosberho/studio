import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendRoleInvitation } from "@/lib/email";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, name: true, email: true, image: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(admins);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { email } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    if (existing.role === "ADMIN") {
      return NextResponse.json(
        { error: "Este usuario ya es administrador" },
        { status: 409 },
      );
    }

    if (existing.role === "CLIENT") {
      return NextResponse.json(
        {
          error: `Ya existe un cliente con este correo (${existing.name || normalizedEmail}). ¿Deseas convertirlo en admin?`,
          existingUser: { id: existing.id, name: existing.name, email: existing.email },
          requireConfirm: true,
        },
        { status: 409 },
      );
    }

    if (existing.role === "COACH") {
      return NextResponse.json(
        {
          error: `Este correo pertenece a un coach (${existing.name || normalizedEmail}). ¿Deseas convertirlo en admin?`,
          existingUser: { id: existing.id, name: existing.name, email: existing.email },
          requireConfirm: true,
        },
        { status: 409 },
      );
    }
  }

  const user = await prisma.user.create({
    data: { email: normalizedEmail, role: "ADMIN" },
    select: { id: true, name: true, email: true, image: true, createdAt: true },
  });

  const origin = request.nextUrl.origin;
  await sendRoleInvitation({
    to: normalizedEmail,
    role: "ADMIN",
    invitedBy: session.user.name || "Un administrador",
    loginUrl: `${origin}/login`,
  });

  return NextResponse.json(user, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role: "ADMIN" },
    select: { id: true, name: true, email: true, image: true, createdAt: true },
  });

  const origin = request.nextUrl.origin;
  await sendRoleInvitation({
    to: user.email,
    role: "ADMIN",
    invitedBy: session.user.name || "Un administrador",
    loginUrl: `${origin}/login`,
  });

  return NextResponse.json(user);
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  }

  if (userId === session.user.id) {
    return NextResponse.json(
      { error: "No puedes removerte a ti mismo como admin" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: "CLIENT" },
  });

  return NextResponse.json({ success: true });
}
