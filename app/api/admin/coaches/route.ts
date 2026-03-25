import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendRoleInvitation } from "@/lib/email";

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
    include: { coachProfile: true },
  });

  if (existing?.role === "COACH" && existing.coachProfile) {
    return NextResponse.json(
      { error: "Este usuario ya es coach" },
      { status: 409 },
    );
  }

  const origin = request.nextUrl.origin;

  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.id },
        data: { role: "COACH" },
      });
      if (!existing.coachProfile) {
        await tx.coachProfile.create({
          data: { userId: existing.id },
        });
      }
    });

    await sendRoleInvitation({
      to: normalizedEmail,
      role: "COACH",
      invitedBy: session.user.name || "Un administrador",
      loginUrl: `${origin}/login`,
    });

    const coach = await prisma.coachProfile.findUnique({
      where: { userId: existing.id },
      include: { user: { select: { name: true, email: true, image: true } } },
    });

    return NextResponse.json(coach, { status: 200 });
  }

  const user = await prisma.user.create({
    data: { email: normalizedEmail, role: "COACH" },
  });

  const coach = await prisma.coachProfile.create({
    data: { userId: user.id },
    include: { user: { select: { name: true, email: true, image: true } } },
  });

  await sendRoleInvitation({
    to: normalizedEmail,
    role: "COACH",
    invitedBy: session.user.name || "Un administrador",
    loginUrl: `${origin}/login`,
  });

  return NextResponse.json(coach, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { coachProfileId } = await request.json();
  if (!coachProfileId) {
    return NextResponse.json({ error: "coachProfileId requerido" }, { status: 400 });
  }

  const profile = await prisma.coachProfile.findUnique({
    where: { id: coachProfileId },
    include: { _count: { select: { classes: true } } },
  });

  if (!profile) {
    return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.coachProfile.delete({ where: { id: coachProfileId } });
    await tx.user.update({
      where: { id: profile.userId },
      data: { role: "CLIENT" },
    });
  });

  return NextResponse.json({ success: true });
}
