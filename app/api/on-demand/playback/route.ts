import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { checkOnDemandAccess, startStreamSession } from "@/lib/on-demand";
import { signPlaybackToken } from "@/lib/cloudflare-stream";

interface RequestBody {
  videoId: string;
}

function clientIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

/**
 * Mint a signed playback token for a member to stream an on-demand video.
 *
 * Steps (any failure aborts the chain — token is never minted speculatively):
 *   1. Auth: requires a valid client session in the tenant.
 *   2. Gating: requires checkOnDemandAccess() to return hasAccess=true.
 *   3. Concurrency: starts a new OnDemandStreamSession (supersedes any other
 *      active session for this user in this tenant).
 *   4. Sign: builds JWT with TTL=1h. We deliberately do not IP-bind the token:
 *      mobile carriers (CGNAT, IPv4/IPv6 transitions, edge re-routing) often
 *      have Cloudflare see a different IP than Vercel, which broke playback on
 *      cellular. The session row + heartbeat already enforce single-active-stream
 *      concurrency, so the token doesn't need to police that on its own.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as RequestBody;
    if (!body.videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    const video = await prisma.onDemandVideo.findFirst({
      where: {
        id: body.videoId,
        tenantId: ctx.tenant.id,
        published: true,
        status: "ready",
      },
    });
    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const access = await checkOnDemandAccess({
      userId: ctx.session.user.id,
      tenantId: ctx.tenant.id,
    });
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: "No active on-demand subscription", access },
        { status: 402 },
      );
    }

    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent");

    const session = await startStreamSession({
      tenantId: ctx.tenant.id,
      userId: ctx.session.user.id,
      videoId: video.id,
      clientIp: ip,
      userAgent: userAgent,
    });

    const { token, expiresAt } = await signPlaybackToken({
      videoUid: video.cloudflareStreamUid,
      ttlSeconds: 60 * 60,
    });

    await prisma.onDemandVideo.update({
      where: { id: video.id },
      data: { viewCount: { increment: 1 } },
    });

    return NextResponse.json({
      sessionId: session.id,
      token,
      expiresAt: expiresAt.toISOString(),
      videoUid: video.cloudflareStreamUid,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/on-demand/playback error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
