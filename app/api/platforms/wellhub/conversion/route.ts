// Wellhub → Magic conversion funnel. Useful for the studio to answer
// "of all the Wellhub users we've ever served, how many have converted to
// direct members / package buyers / subscribers?"
//
// Stages (cumulative, narrowing):
//   1. visitors_total            — WellhubUserLink rows ever seen
//   2. with_profile              — captured at least email or phone
//   3. linked_to_user            — WellhubUserLink.userId is set
//   4. with_active_membership    — Magic Membership exists (auto-true post-link)
//   5. with_active_package       — has UserPackage with status=ACTIVE
//   6. with_active_subscription  — has MemberSubscription with status=active/trialing

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");
    const tenantId = tenant.id;

    const [
      visitorsTotal,
      withProfile,
      linkedRows,
    ] = await Promise.all([
      prisma.wellhubUserLink.count({ where: { tenantId } }),
      prisma.wellhubUserLink.count({
        where: {
          tenantId,
          OR: [{ email: { not: null } }, { phone: { not: null } }],
        },
      }),
      prisma.wellhubUserLink.findMany({
        where: { tenantId, userId: { not: null } },
        select: {
          userId: true,
          userLinkedAt: true,
          linkedVia: true,
          firstSeenAt: true,
        },
      }),
    ]);

    const linkedUserIds = linkedRows.map((r) => r.userId).filter((id): id is string => !!id);

    const [withPackage, withSubscription, sampleRecent] = linkedUserIds.length > 0
      ? await Promise.all([
          prisma.userPackage.count({
            where: {
              tenantId,
              userId: { in: linkedUserIds },
              status: "ACTIVE",
            },
          }),
          prisma.memberSubscription.count({
            where: {
              tenantId,
              userId: { in: linkedUserIds },
              status: { in: ["active", "trialing"] },
            },
          }),
          prisma.wellhubUserLink.findMany({
            where: { tenantId, userId: { not: null } },
            orderBy: { userLinkedAt: "desc" },
            take: 10,
            select: {
              id: true,
              fullName: true,
              email: true,
              userId: true,
              userLinkedAt: true,
              linkedVia: true,
              firstSeenAt: true,
              user: {
                select: { name: true, image: true },
              },
            },
          }),
        ])
      : [0, 0, []];

    // Avg time-to-conversion (days) — only consider rows with a valid range.
    const conversionDeltasMs = linkedRows
      .filter((r) => r.userLinkedAt && r.firstSeenAt && r.userLinkedAt > r.firstSeenAt)
      .map((r) => r.userLinkedAt!.getTime() - r.firstSeenAt.getTime());
    const avgDaysToConvert =
      conversionDeltasMs.length > 0
        ? conversionDeltasMs.reduce((a, b) => a + b, 0) /
          conversionDeltasMs.length /
          (1000 * 60 * 60 * 24)
        : null;

    const linkedTotal = linkedRows.length;
    return NextResponse.json({
      funnel: {
        visitors_total: visitorsTotal,
        with_profile: withProfile,
        linked_to_user: linkedTotal,
        with_active_membership: linkedTotal, // every linked row implies a Membership
        with_active_package: withPackage,
        with_active_subscription: withSubscription,
      },
      avgDaysToConvert,
      recentConversions: sampleRecent.map((r) => ({
        id: r.id,
        name: r.user?.name ?? r.fullName ?? "—",
        image: r.user?.image ?? null,
        email: r.email,
        firstSeenAt: r.firstSeenAt.toISOString(),
        linkedAt: r.userLinkedAt?.toISOString() ?? null,
        linkedVia: r.linkedVia,
      })),
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/wellhub/conversion error:", error);
    return NextResponse.json({ error: "Failed to compute conversion" }, { status: 500 });
  }
}
