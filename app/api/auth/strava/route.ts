import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildStravaAuthUrl } from "@/lib/strava";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const host = request.headers.get("host") || process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const origin = `${protocol}://${host}`;

    const redirectUri = `${origin}/api/auth/strava/callback`;
    const state = `${session.user.id}:${host}`;
    const url = buildStravaAuthUrl(session.user.id, redirectUri, state);

    return NextResponse.redirect(url);
  } catch (error) {
    console.error("GET /api/auth/strava error:", error);
    return NextResponse.json({ error: "Failed to initiate Strava auth" }, { status: 500 });
  }
}
