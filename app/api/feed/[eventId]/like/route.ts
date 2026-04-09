import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { sendPushToUser, sendPushToMany, getClassPostRecipients } from "@/lib/push";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();

    const { eventId } = await params;

    const feedEvent = await prisma.feedEvent.findFirst({
      where: { id: eventId, tenantId: tenant.id },
      select: { id: true, userId: true, eventType: true, payload: true },
    });
    if (!feedEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const type = (body as { type?: string }).type ?? "like";

    const existing = await prisma.like.findUnique({
      where: { userId_feedEventId: { userId: session.user.id, feedEventId: eventId } },
    });

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      return NextResponse.json({ liked: false });
    }

    await prisma.like.create({
      data: {
        userId: session.user.id,
        feedEventId: eventId,
        type,
      },
    });

    const likerName = session.user.name?.split(" ")[0] ?? "Alguien";

    if (feedEvent.eventType === "CLASS_COMPLETED") {
      const payload = feedEvent.payload as Record<string, unknown>;
      const className = (payload.className as string) ?? "la clase";
      const recipients = getClassPostRecipients(payload, session.user.id);
      sendPushToMany(
        recipients,
        {
          title: className,
          body: `A ${likerName} le gustó el post`,
          url: `/my?post=${eventId}`,
          tag: `like-${eventId}`,
        },
        tenant.id,
      );
    } else if (feedEvent.userId !== session.user.id) {
      const label = type === "kudos" ? "te dio kudos" : "le dio like a tu actividad";
      sendPushToUser(feedEvent.userId, {
        title: type === "kudos" ? "Kudos" : "Nuevo like",
        body: `${likerName} ${label}`,
        url: `/my?post=${eventId}`,
        tag: `like-${eventId}-${session.user.id}`,
      }, tenant.id).catch(() => {});
    }

    return NextResponse.json({ liked: true, type });
  } catch (error) {
    console.error("POST /api/feed/[eventId]/like error:", error);
    return NextResponse.json(
      { error: "Failed to toggle like" },
      { status: 500 },
    );
  }
}
