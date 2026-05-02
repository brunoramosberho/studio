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
  fileSize?: number;
}

const DEFAULT_MAX_DURATION = 60 * 60 * 3;
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024 * 1024;

function hostFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function collectAllowedOrigins(request: NextRequest): string[] {
  const origins = new Set<string>();
  const requestHost = hostFromUrl(request.headers.get("origin")) ?? request.headers.get("host");
  if (requestHost) origins.add(requestHost);

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (root) {
    origins.add(root);
    if (!root.includes("*")) origins.add(`*.${root}`);
  }

  return [...origins];
}

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
    const fileSize =
      typeof body.fileSize === "number" ? Math.floor(body.fileSize) : NaN;
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json(
        { error: "fileSize is required and must be a positive integer (bytes)" },
        { status: 400 },
      );
    }
    if (fileSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max allowed: ${MAX_UPLOAD_BYTES} bytes` },
        { status: 413 },
      );
    }

    // Build the CORS allowlist Cloudflare echoes onto the upload session.
    // We allow the origin issuing this admin request (the studio's tenant
    // subdomain) plus the configured public root domain (covers all
    // <slug>.<root> subdomains in production).
    const allowedOrigins = collectAllowedOrigins(request);

    const { uploadURL, uid } = await createDirectUpload({
      uploadLength: fileSize,
      maxDurationSeconds: body.maxDurationSeconds ?? DEFAULT_MAX_DURATION,
      requireSignedURLs: true,
      allowedOrigins,
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
