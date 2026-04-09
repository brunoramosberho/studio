import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const code = request.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }

    const membership = await prisma.membership.findFirst({
      where: { referralCode: code, tenantId: tenant.id },
      select: {
        user: {
          select: { name: true, image: true },
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ referrer: null });
    }

    const config = await prisma.referralConfig.findUnique({
      where: { tenantId: tenant.id },
      select: {
        isEnabled: true,
        refereeRewardText: true,
        refereeRewardWhen: true,
      },
    });

    const nameParts = (membership.user.name ?? "").split(" ");
    const firstName = nameParts[0] || "";
    const lastInitial = nameParts[1]?.[0] ? `${nameParts[1][0]}.` : "";

    return NextResponse.json({
      referrer: {
        firstName,
        lastInitial,
        image: membership.user.image,
      },
      reward: config?.isEnabled
        ? {
            text: config.refereeRewardText,
            when: config.refereeRewardWhen,
          }
        : null,
    });
  } catch (error) {
    console.error("GET /api/referrals/lookup error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
