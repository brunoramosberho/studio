import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { id: userId } = await params;

    const coach = await prisma.coachProfile.findFirst({
      where: { userId, tenantId: ctx.tenant.id },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    if (!coach) {
      return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
    }

    return NextResponse.json(coach);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { id: userId } = await params;
    const { name, bio, photoUrl, specialties } = await request.json();

    const coach = await prisma.coachProfile.findFirst({
      where: { userId, tenantId: ctx.tenant.id },
    });

    if (!coach) {
      return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
    }

    const isOwner = ctx.session.user.id === userId;
    const isAdmin = ctx.membership.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const updated = await prisma.coachProfile.update({
      where: { id: coach.id },
      data: {
        ...(typeof name === "string" && name.trim() && { name: name.trim() }),
        ...(typeof bio === "string" && { bio }),
        ...(typeof photoUrl === "string" && { photoUrl }),
        ...(Array.isArray(specialties) && { specialties }),
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
