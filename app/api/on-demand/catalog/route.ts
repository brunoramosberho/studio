import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, getAuthContext } from "@/lib/tenant";
import { checkOnDemandAccess } from "@/lib/on-demand";
import { signThumbnailUrl } from "@/lib/cloudflare-stream";

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenant();

    const { searchParams } = new URL(request.url);
    const coachProfileId = searchParams.get("coachProfileId");
    const classTypeId = searchParams.get("classTypeId");
    const minDuration = searchParams.get("minDurationMinutes");
    const maxDuration = searchParams.get("maxDurationMinutes");

    const ctx = await getAuthContext();
    const access = ctx
      ? await checkOnDemandAccess({
          userId: ctx.session.user.id,
          tenantId: tenant.id,
        })
      : { hasAccess: false, reason: "no_access" as const };

    const config = await prisma.onDemandConfig.findUnique({
      where: { tenantId: tenant.id },
      include: {
        package: {
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            recurringInterval: true,
          },
        },
      },
    });

    const videos = await prisma.onDemandVideo.findMany({
      where: {
        tenantId: tenant.id,
        published: true,
        status: "ready",
        ...(coachProfileId && { coachProfileId }),
        ...(classTypeId && { classTypeId }),
        ...(minDuration && { durationSeconds: { gte: Number(minDuration) * 60 } }),
        ...(maxDuration && { durationSeconds: { lte: Number(maxDuration) * 60 } }),
      },
      include: {
        coachProfile: { select: { id: true, name: true, photoUrl: true } },
        classType: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });

    const withSignedThumbs = await Promise.all(
      videos.map(async (v) => {
        let signedThumb: string | null = null;
        if (
          !v.thumbnailUrl &&
          v.cloudflareThumbnailUrl &&
          v.cloudflareStreamUid
        ) {
          try {
            signedThumb = await signThumbnailUrl({
              videoUid: v.cloudflareStreamUid,
              rawThumbnailUrl: v.cloudflareThumbnailUrl,
            });
          } catch (e) {
            console.warn(
              `[on-demand] failed to sign thumbnail for ${v.id}:`,
              e instanceof Error ? e.message : e,
            );
          }
        }
        return { ...v, signedThumbnailUrl: signedThumb };
      }),
    );

    return NextResponse.json({
      videos: withSignedThumbs,
      config: config
        ? {
            enabled: config.enabled,
            description: config.description,
            package: config.package,
          }
        : null,
      access,
    });
  } catch (err) {
    console.error("GET /api/on-demand/catalog error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
