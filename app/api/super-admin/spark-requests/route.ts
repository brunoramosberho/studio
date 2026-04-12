import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const url = new URL(request.url);
    const status = url.searchParams.get("status"); // "all" | "pending" | "resolved"
    const category = url.searchParams.get("category");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = 50;

    const where: Record<string, unknown> = {};
    if (status === "pending") where.isResolved = false;
    if (status === "resolved") where.isResolved = true;
    if (category && category !== "all") where.category = category;

    const [requests, total, categoryStats] = await Promise.all([
      prisma.sparkFeatureRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.sparkFeatureRequest.count({ where }),
      prisma.sparkFeatureRequest.groupBy({
        by: ["category"],
        _count: true,
        orderBy: { _count: { category: "desc" } },
      }),
    ]);

    return NextResponse.json({
      requests,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      categoryStats: categoryStats.map((c) => ({
        category: c.category || "other",
        count: c._count,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const body = await request.json();
    const { id, isResolved } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updated = await prisma.sparkFeatureRequest.update({
      where: { id },
      data: {
        isResolved: isResolved ?? true,
        resolvedAt: isResolved ? new Date() : null,
      },
    });

    return NextResponse.json(updated);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
