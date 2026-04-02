import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enrichPayloadsWithCurrentClassType } from "@/lib/feed-class-payload-sync";
import { requireRole } from "@/lib/tenant";
import { sendPushToUser, type PushPayload } from "@/lib/push";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { searchParams } = request.nextUrl;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "30"), 50);
    const filter = searchParams.get("filter");

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

    await enrichPayloadsWithCurrentClassType(
      prisma,
      items.map((e) => e.payload as Record<string, unknown> | null),
    );

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
    const { title, body: postBody, category, targetCityIds, sendPush, postAsAdmin, isPinned } = body;

    if (!postBody?.trim()) {
      return NextResponse.json({ error: "El contenido es requerido" }, { status: 400 });
    }

    const validCategories = ["announcement", "challenge", "photo", "motivation"];
    const cat = validCategories.includes(category) ? category : "announcement";

    const cityIds: string[] | null = Array.isArray(targetCityIds) && targetCityIds.length > 0
      ? targetCityIds
      : null;

    let authorName: string;
    let authorImage: string | null;

    if (postAsAdmin) {
      const adminUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, image: true },
      });
      authorName = adminUser?.name ?? "Admin";
      authorImage = adminUser?.image ?? null;
    } else {
      authorName = tenant.name;
      authorImage = tenant.appIconUrl;
    }

    if (isPinned) {
      await prisma.feedEvent.updateMany({
        where: { tenantId: tenant.id, isPinned: true },
        data: { isPinned: false },
      });
    }

    const event = await prisma.feedEvent.create({
      data: {
        userId: session.user.id,
        tenantId: tenant.id,
        eventType: "STUDIO_POST",
        visibility: "STUDIO_WIDE",
        isPinned: !!isPinned,
        payload: {
          isStudioPost: true,
          title: title || null,
          body: postBody,
          category: cat,
          targetCityIds: cityIds,
          sentPush: !!sendPush,
          postAsAdmin: !!postAsAdmin,
          authorName,
          authorImage,
        },
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    if (sendPush) {
      const pushTitle = title || "Nuevo mensaje del estudio";
      const pushBody = postBody.length > 120 ? postBody.slice(0, 117) + "..." : postBody;

      const userWhere: Record<string, unknown> = {};
      if (cityIds) {
        userWhere.cityId = { in: cityIds };
      }

      const subs = await prisma.pushSubscription.findMany({
        where: {
          tenantId: tenant.id,
          user: userWhere,
        },
        select: { userId: true },
        distinct: ["userId"],
      });

      const uniqueUserIds = subs.map((s) => s.userId);

      const payload: PushPayload = {
        title: pushTitle,
        body: pushBody,
        url: "/my",
        tag: `studio-post-${event.id}`,
      };

      const BATCH = 20;
      for (let i = 0; i < uniqueUserIds.length; i += BATCH) {
        const batch = uniqueUserIds.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map((uid) => sendPushToUser(uid, payload)),
        );
      }
    }

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/feed error:", error);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
