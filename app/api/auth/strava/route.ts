import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildStravaAuthUrl,
  countActiveStravaConnections,
  STRAVA_MEMBER_LIMIT,
} from "@/lib/strava";

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

    // Gate against the Strava app member cap: if we're at the limit and this
    // user isn't already connected, send them back with a clear "full" message
    // instead of letting Strava reject the OAuth opaquely.
    const existing = await prisma.userWearableConnection.findUnique({
      where: {
        userId_provider: { userId: session.user.id, provider: "STRAVA" },
      },
      select: { disconnectedAt: true },
    });
    const alreadyConnected = existing != null && existing.disconnectedAt == null;
    if (!alreadyConnected) {
      const activeCount = await countActiveStravaConnections();
      if (activeCount >= STRAVA_MEMBER_LIMIT) {
        const proto = originHost.includes("localhost") ? "http" : "https";
        return NextResponse.redirect(
          `${proto}://${originHost}/my/profile?strava=limit`,
        );
      }
    }

    const state = `${session.user.id}:${originHost}`;

    const url = buildStravaAuthUrl(session.user.id, redirectUri, state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("GET /api/auth/strava error:", error);
    return NextResponse.json({ error: "Failed to initiate Strava auth" }, { status: 500 });
  }
}
