import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { signThumbnailUrl } from "@/lib/cloudflare-stream";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await requireTenant();
    const { id } = await context.params;

    const video = await prisma.onDemandVideo.findFirst({
      where: {
        id,
        tenantId: tenant.id,
        published: true,
        status: "ready",
      },
      include: {
        coachProfile: {
          select: {
            id: true,
            userId: true,
            name: true,
            photoUrl: true,
            bio: true,
          },
        },
        classType: { select: { id: true, name: true, color: true } },
        category: { select: { id: true, name: true, color: true } },
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let signedThumb: string | null = null;
    if (
      !video.thumbnailUrl &&
      video.cloudflareThumbnailUrl &&
      video.cloudflareStreamUid
    ) {
      try {
        signedThumb = await signThumbnailUrl({
          videoUid: video.cloudflareStreamUid,
          rawThumbnailUrl: video.cloudflareThumbnailUrl,
        });
      } catch (e) {
        console.warn(
          `[on-demand] failed to sign thumbnail for ${video.id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    return NextResponse.json({
      video: { ...video, signedThumbnailUrl: signedThumb },
    });
  } catch (err) {
    console.error("GET /api/on-demand/video/[id] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
