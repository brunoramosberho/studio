import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;
    const conv = await prisma.schedulePlanConversation.findFirst({
      where: { id, tenantId: ctx.tenant.id, adminUserId: ctx.session.user.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!conv) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ conversation: conv });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;
    const conv = await prisma.schedulePlanConversation.findFirst({
      where: { id, tenantId: ctx.tenant.id, adminUserId: ctx.session.user.id },
      select: { id: true },
    });
    if (!conv) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.schedulePlanConversation.update({
      where: { id: conv.id },
      data: { status: "ARCHIVED" },
    });
    return NextResponse.json({ archived: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;
    const body = (await request.json()) as { title?: string };
    const conv = await prisma.schedulePlanConversation.findFirst({
      where: { id, tenantId: ctx.tenant.id, adminUserId: ctx.session.user.id },
      select: { id: true },
    });
    if (!conv) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.schedulePlanConversation.update({
      where: { id: conv.id },
      data: { title: body.title?.slice(0, 80) },
    });
    return NextResponse.json({ updated: true });
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
