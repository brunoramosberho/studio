import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const songs = await prisma.favoriteSong.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(songs);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { title, artist } = body;

  if (!title?.trim() || !artist?.trim()) {
    return NextResponse.json(
      { error: "Title and artist are required" },
      { status: 400 },
    );
  }

  const song = await prisma.favoriteSong.create({
    data: {
      userId: session.user.id,
      title: title.trim(),
      artist: artist.trim(),
    },
  });

  return NextResponse.json(song, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const songId = searchParams.get("id");

  if (!songId) {
    return NextResponse.json({ error: "Song ID required" }, { status: 400 });
  }

  const song = await prisma.favoriteSong.findUnique({
    where: { id: songId },
  });

  if (!song || song.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.favoriteSong.delete({ where: { id: songId } });

  return NextResponse.json({ success: true });
}
