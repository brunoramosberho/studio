// GET lists the cached `WellhubProduct` catalog for the tenant's gym.
// POST refreshes the cache by calling Wellhub.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  WellhubApiError,
  refreshWellhubProducts,
} from "@/lib/platforms/wellhub";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");
    const products = await prisma.wellhubProduct.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(products);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to list products" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { tenant } = await requireRole("ADMIN");
    const config = await prisma.studioPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId: tenant.id, platform: "wellhub" } },
      select: { wellhubGymId: true },
    });
    if (!config?.wellhubGymId) {
      return NextResponse.json({ ok: false, reason: "missing_gym_id" }, { status: 400 });
    }

    try {
      const result = await refreshWellhubProducts({
        tenantId: tenant.id,
        gymId: config.wellhubGymId,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof WellhubApiError) {
        return NextResponse.json({
          ok: false,
          reason: "wellhub_rejected",
          status: error.status,
        }, { status: 502 });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/wellhub/products error:", error);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
