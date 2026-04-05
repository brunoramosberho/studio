import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, requireAuth } from "@/lib/tenant";
import { uploadMedia, deleteMedia } from "@/lib/supabase-storage";
import { sendPushToMany, getClassPostRecipients } from "@/lib/push";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const tenant = await requireTenant();
    const { eventId } = await params;
    const photos = await prisma.photo.findMany({
      where: { feedEventId: eventId, feedEvent: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, image: true } } },
    });
    return NextResponse.json(photos);
  } catch (error) {
    console.error("GET photos error:", error);
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();

    const { eventId } = await params;

    const feedEvent = await prisma.feedEvent.findFirst({
      where: { id: eventId, tenantId: tenant.id },
      select: { id: true, eventType: true, payload: true },
    });
    if (!feedEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (feedEvent.eventType === "CLASS_COMPLETED") {
      const payload = feedEvent.payload as Record<string, unknown>;
      const attendees = (payload.attendees as { id: string }[]) ?? [];
      const isAttendee = attendees.some((a) => a.id === session.user.id);
      if (!isAttendee) {
        return NextResponse.json({ error: "Only attendees can upload photos" }, { status: 403 });
      }
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let result: { url: string; thumbnailUrl: string | null };
    try {
      result = await uploadMedia(buffer, file.name, file.type);
    } catch (uploadErr) {
      const msg = uploadErr instanceof Error ? uploadErr.message : "Unknown storage error";
      console.error("Upload media error:", msg);
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    const photo = await prisma.photo.create({
      data: {
        userId: session.user.id,
        feedEventId: eventId,
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        mimeType: file.type,
      },
      include: { user: { select: { id: true, name: true, image: true } } },
    });

    if (feedEvent.eventType === "CLASS_COMPLETED") {
      const payload = feedEvent.payload as Record<string, unknown>;
      const uploaderName = session.user.name?.split(" ")[0] ?? "Alguien";
      const className = (payload.className as string) ?? "la clase";
      const recipients = getClassPostRecipients(payload, session.user.id);
      sendPushToMany(
        recipients,
        {
          title: "Nueva foto",
          body: `${uploaderName} subió una foto a ${className}`,
          url: "/my",
          tag: `photo-${eventId}`,
        },
        tenant.id,
      );
    }

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("POST photos error:", msg);
    return NextResponse.json({ error: `Failed to upload photo: ${msg}` }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { eventId } = await params;
    const { searchParams } = request.nextUrl;
    const photoId = searchParams.get("photoId");

    if (!photoId) {
      return NextResponse.json({ error: "photoId required" }, { status: 400 });
    }

    const photo = await prisma.photo.findFirst({
      where: { id: photoId, feedEventId: eventId, feedEvent: { tenantId: tenant.id } },
      include: {
        feedEvent: { select: { eventType: true, payload: true } },
      },
    });

    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const isOwner = photo.userId === session.user.id;

    let isCoach = false;
    if (photo.feedEvent.eventType === "CLASS_COMPLETED") {
      const payload = photo.feedEvent.payload as Record<string, unknown>;
      isCoach = payload.coachUserId === session.user.id;
    }

    if (!isOwner && !isCoach) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    await deleteMedia(photo.url);
    await prisma.photo.delete({ where: { id: photoId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE photo error:", error);
    return NextResponse.json({ error: "Failed to delete photo" }, { status: 500 });
  }
}
