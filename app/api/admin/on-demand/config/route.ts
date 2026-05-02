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

    const [config, packages] = await Promise.all([
      prisma.onDemandConfig.findUnique({
        where: { tenantId: ctx.tenant.id },
        include: { package: true },
      }),
      prisma.package.findMany({
        where: {
          tenantId: ctx.tenant.id,
          isActive: true,
          OR: [
            { type: "ON_DEMAND_SUBSCRIPTION" },
            { type: "SUBSCRIPTION", includesOnDemand: true },
          ],
        },
        select: {
          id: true,
          name: true,
          type: true,
          price: true,
          currency: true,
          recurringInterval: true,
          includesOnDemand: true,
        },
      }),
    ]);

    return NextResponse.json({ config, packages });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/admin/on-demand/config error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface UpsertBody {
  enabled?: boolean;
  description?: string | null;
  packageId?: string | null;
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await ensureAdminOnDemand();
    const body = (await request.json()) as UpsertBody;

    if (body.packageId) {
      const pkg = await prisma.package.findFirst({
        where: { id: body.packageId, tenantId: ctx.tenant.id },
      });
      if (!pkg) {
        return NextResponse.json(
          { error: "Package not found in this studio" },
          { status: 400 },
        );
      }
    }

    const config = await prisma.onDemandConfig.upsert({
      where: { tenantId: ctx.tenant.id },
      create: {
        tenantId: ctx.tenant.id,
        enabled: body.enabled ?? false,
        description: body.description ?? null,
        packageId: body.packageId ?? null,
      },
      update: {
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.packageId !== undefined && { packageId: body.packageId }),
      },
    });

    return NextResponse.json({ config });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PUT /api/admin/on-demand/config error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
