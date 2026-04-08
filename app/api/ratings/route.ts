import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const classId = request.nextUrl.searchParams.get("classId");
    if (!classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    const rating = await prisma.classRating.findUnique({
      where: { userId_classId: { userId: session.user.id, classId } },
    });

    if (!rating) return NextResponse.json(null);
    return NextResponse.json(rating);
  } catch (error) {
    console.error("GET /api/ratings error:", error);
    return NextResponse.json({ error: "Failed to fetch rating" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const body = await request.json();
    const { classId, rating, source } = body as {
      classId: string;
      rating: number;
      source: "app_sheet" | "class_page";
    };

    if (!classId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "classId and rating (1-5) are required" }, { status: 400 });
    }

    if (source !== "app_sheet" && source !== "class_page") {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    const classData = await prisma.class.findFirst({
      where: { id: classId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const result = await prisma.classRating.upsert({
      where: { userId_classId: { userId: session.user.id, classId } },
      create: {
        tenantId: tenant.id,
        userId: session.user.id,
        classId,
        rating,
        source,
      },
      update: { rating, source },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ratings error:", error);
    return NextResponse.json({ error: "Failed to save rating" }, { status: 500 });
  }
}
