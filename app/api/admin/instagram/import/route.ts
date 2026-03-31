import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

type IgMediaItem = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
};

async function graphFetch<T>(path: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/v20.0/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function asMimeType(mediaType: IgMediaItem["media_type"]) {
  if (mediaType === "VIDEO") return "video/mp4";
  return "image/jpeg";
}

export async function POST(request: NextRequest) {
  try {
    const { tenant, session } = await requireRole("ADMIN");
    const body = await request.json();
    const mediaIds: string[] = Array.isArray(body?.mediaIds) ? body.mediaIds : [];

    if (mediaIds.length === 0) {
      return NextResponse.json({ error: "mediaIds requerido" }, { status: 400 });
    }

    const prismaAny = prisma as any;
    const ig = await prismaAny.instagramIntegration?.findUnique?.({
      where: { tenantId: tenant.id },
      select: { igUserId: true, accessToken: true, igUsername: true },
    });
    if (!ig) {
      return NextResponse.json({ error: "Not connected" }, { status: 400 });
    }

    // Avoid duplicates: skip media already imported (payload.externalId).
    const importedExternalIds = new Set<string>();
    const existingEvents = await prisma.feedEvent.findMany({
      where: { tenantId: tenant.id, eventType: "STUDIO_POST" },
      select: { payload: true },
      take: 5000,
    });
    for (const e of existingEvents) {
      const ext = (e.payload as any)?.externalId as string | undefined;
      if (ext) importedExternalIds.add(ext);
    }
    const alreadyImportedCount = mediaIds.filter((id) => importedExternalIds.has(id)).length;

    const created: { eventId: string; externalId: string }[] = [];

    for (const mediaId of mediaIds) {
      if (importedExternalIds.has(mediaId)) continue;

      const item = await graphFetch<IgMediaItem>(mediaId, {
        access_token: ig.accessToken,
        fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
      });

      const caption = (item.caption ?? "").trim();
      const permalink = item.permalink ?? null;
      const publishedAt = item.timestamp ? new Date(item.timestamp) : null;

      const event = await prisma.feedEvent.create({
        data: {
          userId: session.user.id,
          tenantId: tenant.id,
          eventType: "STUDIO_POST",
          visibility: "STUDIO_WIDE",
          payload: {
            isStudioPost: true,
            category: "photo",
            title: null,
            body: caption || null,

            provider: "instagram",
            externalId: item.id,
            permalink,
            mediaType: item.media_type,
            igUsername: ig.igUsername ?? null,
            publishedAt: publishedAt ? publishedAt.toISOString() : null,
          },
        },
        select: { id: true },
      });

      const mediaUrl =
        item.media_type === "VIDEO" ? item.thumbnail_url ?? item.media_url : item.media_url;

      if (mediaUrl) {
        await prisma.photo.create({
          data: {
            userId: session.user.id,
            feedEventId: event.id,
            url: mediaUrl,
            thumbnailUrl: item.thumbnail_url ?? null,
            mimeType: asMimeType(item.media_type),
          },
        });
      }

      created.push({ eventId: event.id, externalId: item.id });
      importedExternalIds.add(item.id);
    }

    return NextResponse.json({
      createdCount: created.length,
      skippedExistingCount: alreadyImportedCount,
      created,
    });
  } catch (error) {
    console.error("POST /api/admin/instagram/import error:", error);
    return NextResponse.json({ error: "Failed to import" }, { status: 500 });
  }
}

