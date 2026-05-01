import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { createDirectUpload } from "@/lib/cloudflare-stream";

interface RequestBody {
  title: string;
  description?: string;
  coachProfileId?: string | null;
  classTypeId?: string | null;
  level?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL";
  maxDurationSeconds?: number;
}

const DEFAULT_MAX_DURATION = 60 * 60 * 3;

/**
 * Mint a one-time TUS upload URL for the admin's browser to upload directly
 * to Cloudflare Stream. We immediately create the OnDemandVideo row in
 * `processing` state so the UI can poll status; the row gets filled in
 * (duration, dimensions, thumbnail) by the Cloudflare Stream webhook.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    if (!hasPermission(ctx.membership.role, "onDemand")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as RequestBody;
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const { uploadURL, uid } = await createDirectUpload({
      maxDurationSeconds: body.maxDurationSeconds ?? DEFAULT_MAX_DURATION,
      requireSignedURLs: true,
      meta: {
        name: body.title,
        tenantId: ctx.tenant.id,
      },
    });

    const video = await prisma.onDemandVideo.create({
      data: {
        tenantId: ctx.tenant.id,
        cloudflareStreamUid: uid,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        coachProfileId: body.coachProfileId || null,
        classTypeId: body.classTypeId || null,
        level: body.level ?? "ALL",
        status: "processing",
        published: false,
      },
    });

    return NextResponse.json({
      videoId: video.id,
      cloudflareStreamUid: uid,
      uploadURL,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("POST /api/admin/on-demand/upload-url error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
