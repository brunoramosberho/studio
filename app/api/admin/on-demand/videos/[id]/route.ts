import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { deleteVideo as cfDeleteVideo } from "@/lib/cloudflare-stream";
import type { Level } from "@prisma/client";

async function ensureAdminOnDemand() {
  const ctx = await requireRole("ADMIN");
  if (!hasPermission(ctx.membership.role, "onDemand")) {
    throw new Error("Forbidden");
  }
  return ctx;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await ensureAdminOnDemand();
    const { id } = await context.params;

    const video = await prisma.onDemandVideo.findFirst({
      where: { id, tenantId: ctx.tenant.id },
      include: {
        coachProfile: { select: { id: true, name: true } },
        classType: { select: { id: true, name: true } },
      },
    });
    if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ video });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/admin/on-demand/videos/[id] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface UpdateBody {
  title?: string;
  description?: string | null;
  coachProfileId?: string | null;
  classTypeId?: string | null;
  level?: Level;
  published?: boolean;
  thumbnailUrl?: string | null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await ensureAdminOnDemand();
    const { id } = await context.params;
    const body = (await request.json()) as UpdateBody;

    const existing = await prisma.onDemandVideo.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.published === true && existing.status !== "ready") {
      return NextResponse.json(
        { error: "Video must be ready before publishing" },
        { status: 400 },
      );
    }

    const updated = await prisma.onDemandVideo.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.coachProfileId !== undefined && { coachProfileId: body.coachProfileId }),
        ...(body.classTypeId !== undefined && { classTypeId: body.classTypeId }),
        ...(body.level !== undefined && { level: body.level }),
        ...(body.thumbnailUrl !== undefined && { thumbnailUrl: body.thumbnailUrl }),
        ...(body.published !== undefined && {
          published: body.published,
          publishedAt: body.published && !existing.publishedAt ? new Date() : existing.publishedAt,
        }),
      },
    });

    return NextResponse.json({ video: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PATCH /api/admin/on-demand/videos/[id] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await ensureAdminOnDemand();
    const { id } = await context.params;

    const existing = await prisma.onDemandVideo.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    try {
      await cfDeleteVideo(existing.cloudflareStreamUid);
    } catch (err) {
      console.warn(
        `Failed to delete video ${existing.cloudflareStreamUid} from Cloudflare; proceeding to delete DB row:`,
        err,
      );
    }

    await prisma.onDemandVideo.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/admin/on-demand/videos/[id] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
