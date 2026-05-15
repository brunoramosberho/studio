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

export async function GET() {
  try {
    const ctx = await ensureAdminOnDemand();

    const categories = await prisma.onDemandCategory.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { videos: true } },
      },
    });

    return NextResponse.json({ categories });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/admin/on-demand/categories error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface CreateBody {
  name?: string;
  color?: string;
  sortOrder?: number;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await ensureAdminOnDemand();
    const body = (await request.json()) as CreateBody;

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const category = await prisma.onDemandCategory.create({
      data: {
        tenantId: ctx.tenant.id,
        name,
        color: body.color?.trim() || "#C9A96E",
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      },
    });

    return NextResponse.json({ category });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/admin/on-demand/categories error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
