import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { getTenantBaseUrl } from "@/lib/email";
import { getOrCreateReferralCode } from "@/lib/referrals/code";

// Fetch (creating the code if needed) a specific member's share link, so the
// desk can hand it out before the member has any activity.
export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("marketing");
    const { userId } = await req.json();
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: ctx.tenant.id } },
      select: { id: true, user: { select: { name: true } } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    const code = await getOrCreateReferralCode(userId, ctx.tenant.id);
    const link = `${getTenantBaseUrl(ctx.tenant.slug)}/schedule?ref=${code}`;
    return NextResponse.json({ link, code, name: membership.user.name });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("POST /api/admin/growth/share-links error:", error);
    return NextResponse.json({ error: "Failed to build link" }, { status: 500 });
  }
}

// Ambassador leaderboard: every member who has a share link with activity —
// clicks, bookings, purchases and attributed revenue — plus each member's
// link so the desk can hand it out. Sorted by what pays: revenue, then clicks.
export async function GET() {
  try {
    const ctx = await requirePermission("marketing");
    const tenantId = ctx.tenant.id;

    const [clickAgg, convRows] = await Promise.all([
      prisma.memberShareClick.groupBy({
        by: ["membershipId"],
        where: { tenantId },
        _count: { id: true },
      }),
      prisma.memberShareConversion.groupBy({
        by: ["membershipId", "kind"],
        where: { tenantId },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    type Acc = { clicks: number; bookings: number; purchases: number; revenue: number };
    const byMembership = new Map<string, Acc>();
    const acc = (id: string): Acc => {
      const a = byMembership.get(id) ?? { clicks: 0, bookings: 0, purchases: 0, revenue: 0 };
      byMembership.set(id, a);
      return a;
    };
    for (const c of clickAgg) acc(c.membershipId).clicks = c._count.id;
    for (const r of convRows) {
      const a = acc(r.membershipId);
      if (r.kind === "purchase") {
        a.purchases += r._count.id;
        a.revenue += r._sum.amount ?? 0;
      } else {
        a.bookings += r._count.id;
      }
    }

    const memberships = byMembership.size
      ? await prisma.membership.findMany({
          where: { id: { in: [...byMembership.keys()] }, tenantId },
          select: {
            id: true,
            referralCode: true,
            userId: true,
            user: { select: { name: true, email: true, image: true } },
          },
        })
      : [];
    const memberById = new Map(memberships.map((m) => [m.id, m]));

    const baseUrl = getTenantBaseUrl(ctx.tenant.slug);

    const rows = [...byMembership.entries()]
      .map(([membershipId, a]) => {
        const m = memberById.get(membershipId);
        if (!m) return null;
        return {
          membershipId,
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
          link: m.referralCode ? `${baseUrl}/schedule?ref=${m.referralCode}` : null,
          ...a,
        };
      })
      .filter(Boolean) as {
      membershipId: string;
      userId: string;
      name: string | null;
      email: string;
      image: string | null;
      link: string | null;
      clicks: number;
      bookings: number;
      purchases: number;
      revenue: number;
    }[];

    rows.sort(
      (a, b) =>
        b.revenue - a.revenue ||
        b.purchases - a.purchases ||
        b.bookings - a.bookings ||
        b.clicks - a.clicks,
    );

    return NextResponse.json({
      rows,
      totals: {
        sharers: rows.length,
        clicks: rows.reduce((s, r) => s + r.clicks, 0),
        bookings: rows.reduce((s, r) => s + r.bookings, 0),
        purchases: rows.reduce((s, r) => s + r.purchases, 0),
        revenue: rows.reduce((s, r) => s + r.revenue, 0),
      },
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/admin/growth/share-links error:", error);
    return NextResponse.json({ error: "Failed to fetch share links" }, { status: 500 });
  }
}
