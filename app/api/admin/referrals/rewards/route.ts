import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const { rewardId, status } = await request.json();

    if (!rewardId || !["delivered", "expired"].includes(status)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const reward = await prisma.referralReward.findFirst({
      where: { id: rewardId, tenantId: ctx.tenant.id },
    });

    if (!reward) {
      return NextResponse.json({ error: "Reward not found" }, { status: 404 });
    }

    const updated = await prisma.referralReward.update({
      where: { id: rewardId },
      data: {
        status,
        ...(status === "delivered" ? { deliveredAt: new Date() } : {}),
      },
    });

    return NextResponse.json({ reward: updated });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("PATCH /api/admin/referrals/rewards error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
