import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConversionConfig } from "@/lib/conversion/nudge-engine";
import { sendSavingsNudgeEmail, getTenantBaseUrl } from "@/lib/email";

export async function POST() {
  try {
    const authHeader =
      process.env.CRON_SECRET &&
      `Bearer ${process.env.CRON_SECRET}`;

    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, slug: true },
    });

    let totalSent = 0;

    for (const tenant of tenants) {
      const config = await getConversionConfig(tenant.id);
      if (!config.savingsEmailEnabled) continue;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const activeSubs = await prisma.userPackage.findMany({
        where: {
          tenantId: tenant.id,
          package: { type: "SUBSCRIPTION" },
          expiresAt: { gt: now },
        },
        select: { userId: true },
      });
      const subscribedUserIds = new Set(activeSubs.map((s) => s.userId));

      const bookingsByUser = await prisma.booking.groupBy({
        by: ["userId"],
        where: {
          tenantId: tenant.id,
          status: { not: "CANCELLED" },
          createdAt: { gte: startOfMonth },
          userId: { not: null },
        },
        _count: { id: true },
        having: {
          id: { _count: { gte: config.savingsEmailTriggerClasses } },
        },
      });

      const subscriptionPkg = await prisma.package.findFirst({
        where: {
          tenantId: tenant.id,
          type: "SUBSCRIPTION",
          isActive: true,
        },
        orderBy: { price: "asc" },
        select: { price: true, currency: true, name: true, id: true },
      });

      if (!subscriptionPkg) continue;

      const avgPriceResult = await prisma.package.findMany({
        where: {
          tenantId: tenant.id,
          type: { in: ["PACK", "OFFER"] },
          isActive: true,
          credits: { not: null },
        },
        select: { price: true, credits: true },
      });
      const avgClassPrice =
        avgPriceResult.length > 0
          ? avgPriceResult.reduce(
              (sum, p) => sum + (p.credits ? p.price / p.credits : 0),
              0,
            ) / avgPriceResult.length
          : 0;

      if (avgClassPrice === 0) continue;

      for (const group of bookingsByUser) {
        const userId = group.userId!;
        if (subscribedUserIds.has(userId)) continue;

        const classesBought = group._count.id;
        const totalSpent = classesBought * avgClassPrice;

        // Only send if real savings exist (total spent >= membership price)
        if (totalSpent < subscriptionPkg.price) continue;

        const alreadySentThisMonth = await prisma.nudgeEvent.findFirst({
          where: {
            tenantId: tenant.id,
            userId,
            type: "savings_email",
            shownAt: { gte: startOfMonth },
          },
        });
        if (alreadySentThisMonth) continue;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        });
        if (!user?.email) continue;

        const savingsAmount = Math.round((totalSpent - subscriptionPkg.price) * 100) / 100;
        const baseUrl = getTenantBaseUrl(tenant.slug);

        await sendSavingsNudgeEmail({
          to: user.email,
          memberName: user.name ?? "Hola",
          classesBought,
          totalSpent: Math.round(totalSpent * 100) / 100,
          membershipPrice: subscriptionPkg.price,
          savingsAmount,
          currency: subscriptionPkg.currency,
          membershipUrl: `${baseUrl}/packages?utm_source=email&utm_campaign=savings-nudge`,
        });

        await prisma.nudgeEvent.create({
          data: {
            tenantId: tenant.id,
            userId,
            type: "savings_email",
            shown: true,
            metadata: {
              classesBought,
              totalSpent,
              savingsAmount,
              membershipPrice: subscriptionPkg.price,
            },
          },
        });

        totalSent++;
      }
    }

    return NextResponse.json({ sent: totalSent });
  } catch (error) {
    console.error(
      "POST /api/admin/conversion/savings-email/trigger error:",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
