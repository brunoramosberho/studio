import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { eventId } = await params;
    const { caption } = (await request.json()) as { caption?: string };

    const event = await prisma.feedEvent.findFirst({
      where: { id: eventId, tenantId: tenant.id },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (event.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = (event.payload as Record<string, unknown>) ?? {};
    await prisma.feedEvent.update({
      where: { id: eventId },
      data: { payload: { ...payload, caption: caption?.trim() || null } },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Not a member of this studio", "Tenant not found"].includes(error.message)
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("PUT /api/feed/[eventId]/caption error:", error);
    return NextResponse.json(
      { error: "Failed to update caption" },
      { status: 500 },
    );
  }
}
