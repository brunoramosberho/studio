import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { uploadMedia } from "@/lib/supabase-storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const photos = await prisma.photo.findMany({
      where: { feedEventId: eventId },
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
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
