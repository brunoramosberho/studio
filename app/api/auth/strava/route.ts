import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildStravaAuthUrl } from "@/lib/strava";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Always use root domain for callback (Strava validates against registered domain)
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
    const protocol = rootDomain.includes("localhost") ? "http" : "https";
    const redirectUri = `${protocol}://${rootDomain}/api/auth/strava/callback`;

    // Encode the origin host in state so callback redirects back to the right subdomain
    const originHost = request.headers.get("host") || rootDomain;
    const state = `${session.user.id}:${originHost}`;

    const url = buildStravaAuthUrl(session.user.id, redirectUri, state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("GET /api/auth/strava error:", error);
    return NextResponse.json({ error: "Failed to initiate Strava auth" }, { status: 500 });
  }
}
