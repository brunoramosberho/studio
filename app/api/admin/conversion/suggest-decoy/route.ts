import { NextRequest, NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { requireRole, getTenantCurrency } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { suggestDecoyWithAI } from "@/lib/ai/suggest-decoy";
import type { DecoyPackage } from "@/lib/packages/decoy";

/** Spark-powered decoy suggestion for the curated-packages admin section. */
export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json().catch(() => ({}));
    const audience = body.audience === "returning" ? "returning" : "firstTimer";

    const packages = await prisma.package.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
        type: { not: "ON_DEMAND_SUBSCRIPTION" },
      },
      select: { id: true, name: true, price: true, credits: true, type: true },
      orderBy: { sortOrder: "asc" },
    });

    const decoyPackages: DecoyPackage[] = packages.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      credits: p.credits,
      type: p.type,
    }));

    const currency = (await getTenantCurrency()).code;
    const locale = await getLocale();
    const result = await suggestDecoyWithAI(
      decoyPackages,
      audience,
      currency,
      locale === "en" ? "en" : "es",
    );
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized" || message === "Forbidden") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    console.error("POST /api/admin/conversion/suggest-decoy error:", error);
    return NextResponse.json({ error: "Failed to suggest" }, { status: 500 });
  }
}
