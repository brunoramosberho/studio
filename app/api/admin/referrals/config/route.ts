import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");

    const config = await prisma.referralConfig.findUnique({
      where: { tenantId: ctx.tenant.id },
    });

    return NextResponse.json({ config });
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
    console.error("GET /api/admin/referrals/config error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const body = await request.json();

    const config = await prisma.referralConfig.upsert({
      where: { tenantId: ctx.tenant.id },
      create: {
        tenantId: ctx.tenant.id,
        isEnabled: body.isEnabled ?? true,
        triggerStage: body.triggerStage ?? "attended",
        referrerRewardType: body.referrerRewardType ?? "manual",
        referrerRewardValue: body.referrerRewardValue ?? null,
        referrerRewardText: body.referrerRewardText ?? null,
        referrerRewardWhen: body.referrerRewardWhen ?? null,
        refereeRewardType: body.refereeRewardType ?? "manual",
        refereeRewardValue: body.refereeRewardValue ?? null,
        refereeRewardText: body.refereeRewardText ?? null,
        refereeRewardWhen: body.refereeRewardWhen ?? null,
      },
      update: {
        isEnabled: body.isEnabled,
        triggerStage: body.triggerStage,
        referrerRewardType: body.referrerRewardType,
        referrerRewardValue: body.referrerRewardValue,
        referrerRewardText: body.referrerRewardText,
        referrerRewardWhen: body.referrerRewardWhen,
        refereeRewardType: body.refereeRewardType,
        refereeRewardValue: body.refereeRewardValue,
        refereeRewardText: body.refereeRewardText,
        refereeRewardWhen: body.refereeRewardWhen,
      },
    });

    return NextResponse.json({ config });
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
    console.error("POST /api/admin/referrals/config error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
