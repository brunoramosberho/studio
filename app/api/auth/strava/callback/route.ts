import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { exchangeStravaCode } from "@/lib/strava";
import { encrypt } from "@/lib/encryption";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  const profileUrl = "/my/profile";

  if (error || !code) {
    const redirectUrl = new URL(profileUrl, request.url);
    redirectUrl.searchParams.set("strava", "denied");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (state !== session.user.id) {
      const redirectUrl = new URL(profileUrl, request.url);
      redirectUrl.searchParams.set("strava", "error");
      return NextResponse.redirect(redirectUrl);
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

    const redirectUrl = new URL(profileUrl, request.url);
    redirectUrl.searchParams.set("strava", "connected");
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Strava callback error:", err);
    const redirectUrl = new URL(profileUrl, request.url);
    redirectUrl.searchParams.set("strava", "error");
    return NextResponse.redirect(redirectUrl);
  }
}
