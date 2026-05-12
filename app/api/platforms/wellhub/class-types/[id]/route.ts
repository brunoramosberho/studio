// Maps a Magic ClassType to a Wellhub product + category list. The admin
// dialog calls this whenever the user picks a new product for a class type.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { id } = await params;
    const body = await request.json();
    const { wellhubProductId, wellhubCategoryIds } = body as {
      wellhubProductId?: number | null;
      wellhubCategoryIds?: number[];
    };

    const existing = await prisma.classType.findFirst({
      where: { id, tenantId: tenant.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "ClassType not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (wellhubProductId !== undefined) data.wellhubProductId = wellhubProductId;
    if (wellhubCategoryIds !== undefined) {
      data.wellhubCategoryIds = Array.isArray(wellhubCategoryIds)
        ? wellhubCategoryIds.filter((n) => Number.isInteger(n))
        : [];
    }

    const updated = await prisma.classType.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        wellhubClassId: true,
        wellhubProductId: true,
        wellhubCategoryIds: true,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("PATCH /api/platforms/wellhub/class-types/[id] error:", error);
    return NextResponse.json({ error: "Failed to map class type" }, { status: 500 });
  }
}
