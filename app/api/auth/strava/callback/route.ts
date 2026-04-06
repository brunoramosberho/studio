import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { exchangeStravaCode } from "@/lib/strava";
import { encrypt } from "@/lib/encryption";

function buildRedirectUrl(host: string, path: string, params?: Record<string, string>): URL {
  const protocol = host.includes("localhost") ? "http" : "https";
  const url = new URL(path, `${protocol}://${host}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return url;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state") || "";

  // state format: "userId:host" (e.g. "clxyz123:betoro.mgic.app")
  const colonIdx = state.indexOf(":");
  const stateUserId = colonIdx > 0 ? state.slice(0, colonIdx) : state;
  const originHost = colonIdx > 0
    ? state.slice(colonIdx + 1)
    : request.headers.get("host") || process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

  const profilePath = "/my/profile";

  if (error || !code) {
    return NextResponse.redirect(buildRedirectUrl(originHost, profilePath, { strava: "denied" }));
  }

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(buildRedirectUrl(originHost, "/login"));
    }

    if (stateUserId !== session.user.id) {
      return NextResponse.redirect(buildRedirectUrl(originHost, profilePath, { strava: "error" }));
    }

    const tokens = await exchangeStravaCode(code);
    const providerUserId = String(tokens.athlete.id);

    await prisma.userWearableConnection.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: "STRAVA",
        },
      },
      update: {
        providerUserId,
        accessTokenEnc: encrypt(tokens.access_token),
        refreshTokenEnc: encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(tokens.expires_at * 1000),
        disconnectedAt: null,
      },
      create: {
        userId: session.user.id,
        provider: "STRAVA",
        providerUserId,
        accessTokenEnc: encrypt(tokens.access_token),
        refreshTokenEnc: encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(tokens.expires_at * 1000),
      },
    });

    return NextResponse.redirect(buildRedirectUrl(originHost, profilePath, { strava: "connected" }));
  } catch (err) {
    console.error("Strava callback error:", err);
    return NextResponse.redirect(buildRedirectUrl(originHost, profilePath, { strava: "error" }));
  }
}
