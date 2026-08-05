import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { summariseSessions } from "@/lib/on-demand/metrics";

/**
 * Per-video viewing metrics, plus the viewer list for one video when `videoId`
 * is passed — the admin's real question is usually "how is this one doing",
 * followed immediately by "who watched it".
 */
export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requirePermission("onDemand");
    const videoId = request.nextUrl.searchParams.get("videoId");

    if (videoId) return viewersFor(videoId, tenant.id);

    const videos = await prisma.onDemandVideo.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        title: true,
        status: true,
        published: true,
        durationSeconds: true,
        createdAt: true,
        coachProfile: { select: { name: true } },
        streamSessions: {
          select: { userId: true, watchedSeconds: true, furthestSeconds: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = videos.map((v) => {
      const stats = summariseSessions(v.streamSessions, v.durationSeconds);
      return {
        id: v.id,
        title: v.title,
        status: v.status,
        published: v.published,
        durationSeconds: v.durationSeconds,
        coachName: v.coachProfile?.name ?? null,
        plays: v.streamSessions.length,
        uniqueViewers: new Set(v.streamSessions.map((s) => s.userId)).size,
        ...stats,
      };
    });

    return NextResponse.json({
      videos: rows,
      // So the UI can say plainly when there's nothing measured yet rather
      // than rendering a grid of zeros that looks like failure.
      measuredTotal: rows.reduce((sum, r) => sum + r.measured, 0),
    });
  } catch (error) {
    return handleError(error);
  }
}

async function viewersFor(videoId: string, tenantId: string) {
  // Scoped by tenant on the video, so an id from another studio finds nothing.
  const video = await prisma.onDemandVideo.findFirst({
    where: { id: videoId, tenantId },
    select: { id: true, durationSeconds: true },
  });
  if (!video) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sessions = await prisma.onDemandStreamSession.findMany({
    where: { videoId: video.id, tenantId },
    select: {
      id: true,
      startedAt: true,
      watchedSeconds: true,
      furthestSeconds: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 500,
  });

  return NextResponse.json({
    durationSeconds: video.durationSeconds,
    viewers: sessions.map((s) => ({
      sessionId: s.id,
      user: s.user,
      startedAt: s.startedAt,
      watchedSeconds: s.watchedSeconds,
      completionPct:
        video.durationSeconds && video.durationSeconds > 0 && s.watchedSeconds > 0
          ? Math.min(100, Math.round((s.furthestSeconds / video.durationSeconds) * 100))
          : null,
    })),
  });
}

function handleError(error: unknown) {
  if (
    error instanceof Error &&
    ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(
      error.message,
    )
  ) {
    return NextResponse.json(
      { error: error.message },
      { status: error.message === "Unauthorized" ? 401 : 403 },
    );
  }
  console.error("GET /api/admin/on-demand/metrics error:", error);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}
