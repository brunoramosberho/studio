import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, requireAuth } from "@/lib/tenant";
import { uploadMedia } from "@/lib/supabase-storage";

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
    const result = await uploadMedia(buffer, file.name, file.type);

    if (!result) {
      return NextResponse.json(
        { error: "Storage not configured. Set SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503 },
      );
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

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    console.error("POST photos error:", error);
    return NextResponse.json({ error: "Failed to upload photo" }, { status: 500 });
  }
}
