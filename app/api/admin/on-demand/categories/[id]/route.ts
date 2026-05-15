import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";

async function ensureAdminOnDemand() {
  const ctx = await requireRole("ADMIN");
  if (!hasPermission(ctx.membership.role, "onDemand")) {
    throw new Error("Forbidden");
  }
  return ctx;
}

interface UpdateBody {
  name?: string;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await ensureAdminOnDemand();
    const { id } = await context.params;
    const body = (await request.json()) as UpdateBody;

    const existing = await prisma.onDemandCategory.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }

    const updated = await prisma.onDemandCategory.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.color !== undefined && { color: body.color.trim() }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json({ category: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PATCH /api/admin/on-demand/categories/[id] error:", err);
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

    const existing = await prisma.onDemandCategory.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Hard delete: the FK on OnDemandVideo.categoryId is SET NULL, so videos
    // simply lose their category. No orphaned-video cleanup needed.
    await prisma.onDemandCategory.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/admin/on-demand/categories/[id] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
