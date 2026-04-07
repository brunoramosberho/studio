import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createMemberPayment } from "@/lib/stripe/payments";
import type { NudgeType } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;
    const tenantId = tenant.id;

    const body = await request.json();
    const {
      membershipId,
      nudgeType,
      packageCreditAmount,
    }: {
      membershipId: string;
      nudgeType: NudgeType;
      packageCreditAmount?: number;
    } = body;

    if (!membershipId || !nudgeType) {
      return NextResponse.json(
        { error: "membershipId and nudgeType are required" },
        { status: 400 },
      );
    }

    const pkg = await prisma.package.findUnique({
      where: { id: membershipId },
    });

    if (!pkg || pkg.tenantId !== tenantId) {
      return NextResponse.json(
        { error: "Membership not found" },
        { status: 404 },
      );
    }

    const finalPrice = packageCreditAmount
      ? Math.max(0, pkg.price - packageCreditAmount)
      : pkg.price;

    // If the studio has Stripe Connect, create a real PaymentIntent
    const tenantData = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    let paymentIntent: { client_secret: string | null; id: string } | null =
      null;

    const userPackage = await prisma.userPackage.create({
      data: {
        userId,
        packageId: membershipId,
        tenantId,
        creditsTotal: pkg.credits,
        expiresAt: new Date(Date.now() + pkg.validDays * 24 * 60 * 60 * 1000),
        stripePaymentId: "pending_stripe",
      },
    });

    if (tenantData.stripeAccountId && finalPrice > 0) {
      try {
        const pi = await createMemberPayment({
          tenantId,
          memberId: userId,
          amountInCurrency: finalPrice,
          type: "membership",
          referenceId: userPackage.id,
          description: `Membresía ${pkg.name}`,
        });
        paymentIntent = { client_secret: pi.client_secret, id: pi.id };
      } catch (e) {
        console.error("Stripe payment creation failed, keeping pending:", e);
      }
    }

    if (packageCreditAmount && packageCreditAmount > 0) {
      await prisma.nudgeEvent.create({
        data: {
          tenantId,
          userId,
          type: nudgeType,
          shown: true,
          interacted: true,
          interactedAt: new Date(),
          converted: true,
          convertedAt: new Date(),
          membershipId,
          revenue: finalPrice,
          metadata: {
            packageCreditApplied: packageCreditAmount,
            originalPrice: pkg.price,
          },
        },
      });
    } else {
      await prisma.nudgeEvent.create({
        data: {
          tenantId,
          userId,
          type: nudgeType,
          shown: true,
          interacted: true,
          interactedAt: new Date(),
          converted: true,
          convertedAt: new Date(),
          membershipId,
          revenue: finalPrice,
        },
      });
    }

    return NextResponse.json({
      userPackage,
      finalPrice,
      creditApplied: packageCreditAmount ?? 0,
      ...(paymentIntent && {
        clientSecret: paymentIntent.client_secret,
        stripeAccountId: tenantData.stripeAccountId,
      }),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("POST /api/conversion/activate error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
