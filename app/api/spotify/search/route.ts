import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchTracks } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json([]);
    }

    const tracks = await searchTracks(q, 10);
    return NextResponse.json(tracks);
  } catch (error) {
    console.error("Spotify search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
