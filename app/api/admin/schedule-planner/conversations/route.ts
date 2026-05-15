import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const conversations = await prisma.schedulePlanConversation.findMany({
      where: {
        tenantId: ctx.tenant.id,
        adminUserId: ctx.session.user.id,
        status: { not: "ARCHIVED" },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
    return NextResponse.json({ conversations });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST() {
  try {
    const ctx = await requireRole("ADMIN");
    const conv = await prisma.schedulePlanConversation.create({
      data: {
        tenantId: ctx.tenant.id,
        adminUserId: ctx.session.user.id,
      },
      select: { id: true, title: true, status: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ conversation: conv });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "Internal error";
  const status = ["Unauthorized"].includes(message)
    ? 401
    : ["Forbidden", "Not a member of this studio"].includes(message)
      ? 403
      : 500;
  return NextResponse.json({ error: message }, { status });
}
