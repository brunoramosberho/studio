import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, requireTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const classTypeId = request.nextUrl.searchParams.get("classTypeId");

    let reasons = classTypeId
      ? await prisma.ratingReason.findMany({
          where: { tenantId: tenant.id, classTypeId, active: true },
          orderBy: { order: "asc" },
        })
      : [];

    if (reasons.length === 0) {
      reasons = await prisma.ratingReason.findMany({
        where: { tenantId: tenant.id, classTypeId: null, active: true },
        orderBy: { order: "asc" },
      });
    }

    return NextResponse.json(reasons);
  } catch (error) {
    console.error("GET /api/ratings/reasons error:", error);
    return NextResponse.json({ error: "Failed to fetch reasons" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const body = await request.json();
    const { classId, reasons, comment } = body as {
      classId: string;
      reasons: string[];
      comment?: string;
    };

    if (!classId || !reasons?.length) {
      return NextResponse.json(
        { error: "classId and reasons are required" },
        { status: 400 }
      );
    }

    const ctx = await getAuthContext();

    // Try finding the rating: by session user first, then by most recent for this class
    let existing = ctx
      ? await prisma.classRating.findUnique({
          where: { userId_classId: { userId: ctx.session.user.id, classId } },
        })
      : null;

    if (!existing) {
      existing = await prisma.classRating.findFirst({
        where: { classId, tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!existing) {
      return NextResponse.json({ error: "Rating not found" }, { status: 404 });
    }

    const result = await prisma.classRating.update({
      where: { id: existing.id },
      data: { reasons, ...(comment !== undefined && { comment }) },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ratings/reasons error:", error);
    return NextResponse.json({ error: "Failed to save reasons" }, { status: 500 });
  }
}
