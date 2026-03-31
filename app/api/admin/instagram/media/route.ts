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

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") ?? "24"),
      50,
    );

    const prismaAny = prisma as any;
    const ig = await prismaAny.instagramIntegration?.findUnique?.({
      where: { tenantId: tenant.id },
      select: { igUserId: true, accessToken: true, igUsername: true },
    });
    if (!ig) {
      return NextResponse.json({ error: "Not connected" }, { status: 400 });
    }

    const resp = await graphFetch<{ data: IgMediaItem[] }>(`${ig.igUserId}/media`, {
      access_token: ig.accessToken,
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
      limit: String(limit),
    });

    return NextResponse.json({
      igUsername: ig.igUsername ?? null,
      items: resp.data ?? [],
    });
  } catch (error) {
    console.error("GET /api/admin/instagram/media error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

