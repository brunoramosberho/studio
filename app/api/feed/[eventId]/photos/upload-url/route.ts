import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { createSignedUploadUrl } from "@/lib/supabase-storage";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { eventId } = await params;
    const body = await request.json();
    const { filename, contentType } = body as {
      filename?: string;
      contentType?: string;
    };

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "filename and contentType required" },
        { status: 400 },
      );
    }

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
      if (!attendees.some((a) => a.id === session.user.id)) {
        return NextResponse.json(
          { error: "Only attendees can upload" },
          { status: 403 },
        );
      }
    }

    const { signedUrl, publicUrl } = await createSignedUploadUrl(filename);

    return NextResponse.json({ signedUrl, publicUrl });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to create upload URL";
    console.error("POST upload-url error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
