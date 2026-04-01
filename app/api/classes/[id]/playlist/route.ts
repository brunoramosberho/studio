import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteCtx,
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: classId } = await params;
    const tenant = await requireTenant();

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: tenant.id },
      select: { coach: { select: { userId: true } } },
    });

    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const isCoach = cls.coach.userId === session.user.id;

    if (!isCoach) {
      const attended = await prisma.booking.findFirst({
        where: { classId, userId: session.user.id, status: "ATTENDED" },
        select: { id: true },
      });
      if (!attended) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const tracks = await prisma.classPlaylistTrack.findMany({
      where: { classId },
      orderBy: { position: "asc" },
    });

    return NextResponse.json(tracks);
  } catch (error) {
    console.error("GET playlist error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteCtx,
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: classId } = await params;
    const tenant = await requireTenant();

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: tenant.id },
      select: { coach: { select: { userId: true } } },
    });

    if (!cls || cls.coach.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, artist, spotifyTrackId, albumArt, previewUrl } = await request.json();

    if (!title?.trim() || !artist?.trim()) {
      return NextResponse.json({ error: "title and artist required" }, { status: 400 });
    }

    const maxPos = await prisma.classPlaylistTrack.aggregate({
      where: { classId },
      _max: { position: true },
    });

    const track = await prisma.classPlaylistTrack.create({
      data: {
        classId,
        title: title.trim(),
        artist: artist.trim(),
        spotifyTrackId: spotifyTrackId || null,
        albumArt: albumArt || null,
        previewUrl: previewUrl || null,
        position: (maxPos._max.position ?? -1) + 1,
      },
    });

    return NextResponse.json(track, { status: 201 });
  } catch (error) {
    console.error("POST playlist error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteCtx,
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: classId } = await params;
    const tenant = await requireTenant();
    const trackId = request.nextUrl.searchParams.get("trackId");

    if (!trackId) {
      return NextResponse.json({ error: "trackId required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: tenant.id },
      select: { coach: { select: { userId: true } } },
    });

    if (!cls || cls.coach.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.classPlaylistTrack.delete({ where: { id: trackId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE playlist error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
