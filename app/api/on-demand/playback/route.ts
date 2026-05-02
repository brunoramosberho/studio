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
 * Whether `ip` is a loopback / link-local / RFC1918 private address.
 *
 * Used to skip IP-binding the playback JWT when Next.js sees the request as
 * coming from a private network (typical in local dev: `::1` / `127.0.0.1`).
 * Cloudflare's edge sees the user's *public* IP, so binding the token to the
 * private address would always fail — Cloudflare returns 401 for the manifest.
 *
 * In production behind Vercel, the first `x-forwarded-for` value is the
 * client's real public IP, which both Vercel and Cloudflare see — binding
 * works as intended.
 */
function isLoopbackOrPrivate(ip: string): boolean {
  if (ip === "::1") return true;
  if (ip === "0.0.0.0") return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("::ffff:127.")) return true;
  if (ip.startsWith("::ffff:10.")) return true;
  if (ip.startsWith("::ffff:192.168.")) return true;
  if (ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd")) return true; // fc00::/7 unique-local
  if (ip.toLowerCase().startsWith("fe80")) return true; // fe80::/10 link-local
  return false;
}

/**
 * Mint a signed playback token for a member to stream an on-demand video.
 *
 * Steps (any failure aborts the chain — token is never minted speculatively):
 *   1. Auth: requires a valid client session in the tenant.
 *   2. Gating: requires checkOnDemandAccess() to return hasAccess=true.
 *   3. Concurrency: starts a new OnDemandStreamSession (supersedes any other
 *      active session for this user in this tenant).
 *   4. Sign: builds JWT with TTL=1h and IP binding to the request's client IP.
 *
 * The token is short-lived; the client requests a new one if the user pauses
 * for >1h. The session row drives concurrency, not the token.
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

    // Only IP-bind the token when we have a public IP. In local dev the
    // request IP is loopback, but Cloudflare sees the real public IP, so
    // binding here would guarantee a 401 on the manifest.
    const ipBindable = ip && !isLoopbackOrPrivate(ip) ? ip : undefined;

    const { token, expiresAt } = await signPlaybackToken({
      videoUid: video.cloudflareStreamUid,
      ttlSeconds: 60 * 60,
      clientIp: ipBindable,
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
