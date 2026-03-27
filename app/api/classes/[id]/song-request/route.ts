import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { checkSongEligibility } from "@/lib/song-eligibility";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenant = await requireTenant();
    const listAll = request.nextUrl.searchParams.get("list") === "all";

    if (listAll) {
      const requests = await prisma.classSongRequest.findMany({
        where: { classId: id, tenantId: tenant.id },
        include: { user: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(requests);
    }

    const [songRequest, cls] = await Promise.all([
      prisma.classSongRequest.findUnique({
        where: { classId_userId: { classId: id, userId: session.user.id } },
      }),
      prisma.class.findFirst({
        where: { id, tenantId: tenant.id },
        select: { songRequestsEnabled: true, songRequestCriteria: true, startsAt: true },
      }),
    ]);

    let eligible = false;
    if (cls?.songRequestsEnabled) {
      eligible = await checkSongEligibility(
        session.user.id,
        cls.startsAt,
        cls.songRequestCriteria,
        tenant.id,
      );
    }

    return NextResponse.json({ songRequest, eligible, enabled: cls?.songRequestsEnabled ?? false });
  } catch (error) {
    console.error("GET song-request error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await requireTenant();
    const { id } = await params;

    const cls = await prisma.class.findFirst({
      where: { id, tenantId: tenant.id },
      select: { songRequestsEnabled: true, songRequestCriteria: true, startsAt: true },
    });

    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    if (!cls.songRequestsEnabled) {
      return NextResponse.json({ error: "Song requests not enabled" }, { status: 400 });
    }

    const eligible = await checkSongEligibility(
      session.user.id,
      cls.startsAt,
      cls.songRequestCriteria,
      tenant.id,
    );

    if (!eligible) {
      return NextResponse.json({ error: "Not eligible" }, { status: 403 });
    }

    const body = await request.json();
    const { title, artist, spotifyTrackId, albumArt, previewUrl } = body;

    if (!title || !artist) {
      return NextResponse.json({ error: "title and artist required" }, { status: 400 });
    }

    const songRequest = await prisma.classSongRequest.upsert({
      where: { classId_userId: { classId: id, userId: session.user.id } },
      create: {
        classId: id,
        userId: session.user.id,
        tenantId: tenant.id,
        title,
        artist,
        spotifyTrackId: spotifyTrackId || null,
        albumArt: albumArt || null,
        previewUrl: previewUrl || null,
      },
      update: {
        title,
        artist,
        spotifyTrackId: spotifyTrackId || null,
        albumArt: albumArt || null,
        previewUrl: previewUrl || null,
      },
    });

    // Also upsert into the user's favorite songs
    if (spotifyTrackId) {
      const existing = await prisma.favoriteSong.findFirst({
        where: { userId: session.user.id, spotifyTrackId },
      });
      if (!existing) {
        await prisma.favoriteSong.create({
          data: {
            userId: session.user.id,
            title,
            artist,
            spotifyTrackId,
            albumArt: albumArt || null,
            previewUrl: previewUrl || null,
          },
        });
      }
    }

    return NextResponse.json(songRequest, { status: 201 });
  } catch (error) {
    console.error("POST song-request error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.classSongRequest.deleteMany({
      where: { classId: id, userId: session.user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE song-request error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
