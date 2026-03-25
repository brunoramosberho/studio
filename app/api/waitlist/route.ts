import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();

    const body = await request.json();
    const { classId } = body;

    if (!classId) {
      return NextResponse.json(
        { error: "classId is required" },
        { status: 400 },
      );
    }

    const classData = await prisma.class.findUnique({
      where: { id: classId, tenantId: tenant.id },
    });

    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const existingEntry = await prisma.waitlist.findFirst({
      where: { classId, tenantId: tenant.id, userId: session.user.id },
    });

    if (existingEntry) {
      return NextResponse.json(
        { error: "Already on the waitlist for this class" },
        { status: 409 },
      );
    }

    const maxPosition = await prisma.waitlist.aggregate({
      where: { classId, tenantId: tenant.id },
      _max: { position: true },
    });

    const position = (maxPosition._max.position ?? 0) + 1;

    const entry = await prisma.waitlist.create({
      data: {
        tenantId: tenant.id,
        classId,
        userId: session.user.id,
        position,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST /api/waitlist error:", error);
    return NextResponse.json(
      { error: "Failed to join waitlist" },
      { status: 500 },
    );
  }
}
