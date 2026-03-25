import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { searchParams } = request.nextUrl;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "30"), 50);
    const filter = searchParams.get("filter"); // "all" | "studio_posts"

    const where: Record<string, unknown> = { tenantId: tenant.id };
    if (filter === "studio_posts") {
      where.eventType = "STUDIO_POST";
    }

    const events = await prisma.feedEvent.findMany({
      where,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      include: {
        user: { select: { id: true, name: true, image: true } },
        photos: {
          select: { id: true, url: true, thumbnailUrl: true, mimeType: true },
          orderBy: { createdAt: "asc" as const },
        },
        _count: { select: { likes: true, comments: true } },
      },
    });

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const feed = items.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      payload: e.payload,
      visibility: e.visibility,
      isPinned: e.isPinned,
      createdAt: e.createdAt,
      user: e.user,
      photos: e.photos,
      likeCount: e._count.likes,
      commentCount: e._count.comments,
    }));

    return NextResponse.json({ feed, nextCursor });
  } catch (error) {
    console.error("GET /api/admin/feed error:", error);
    return NextResponse.json({ error: "Failed to fetch feed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenant, session } = await requireRole("ADMIN");
    const body = await request.json();
    const { title, body: postBody, category } = body;

    if (!postBody) {
      return NextResponse.json({ error: "El contenido es requerido" }, { status: 400 });
    }

    const validCategories = ["announcement", "challenge", "photo", "motivation"];
    const cat = validCategories.includes(category) ? category : "announcement";

    const event = await prisma.feedEvent.create({
      data: {
        userId: session.user.id,
        tenantId: tenant.id,
        eventType: "STUDIO_POST",
        visibility: "STUDIO_WIDE",
        payload: {
          isStudioPost: true,
          title: title || null,
          body: postBody,
          category: cat,
        },
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/feed error:", error);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
