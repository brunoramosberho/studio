import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildStravaAuthUrl } from "@/lib/strava";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl}/api/auth/strava/callback`;
    const url = buildStravaAuthUrl(session.user.id, redirectUri);

    return NextResponse.redirect(url);
  } catch (error) {
    console.error("GET /api/auth/strava error:", error);
    return NextResponse.json({ error: "Failed to initiate Strava auth" }, { status: 500 });
  }
}
