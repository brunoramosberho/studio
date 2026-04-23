import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireTenant } from "@/lib/tenant";
import { createMemberPayment } from "@/lib/stripe/payments";
import { createCreditUsagesForPackage } from "@/lib/credits";
import { userHasOpenDebt } from "@/lib/billing/debt";

async function validateAndApplyDiscount(
  discountCode: string,
  tenantId: string,
  packageId: string,
  packagePrice: number,
  userId: string | null,
): Promise<{
  valid: boolean;
  error?: string;
  discountId?: string;
  discountAmount?: number;
  finalAmount?: number;
  stripeCouponId?: string | null;
}> {
  const normalized = discountCode.trim().toUpperCase();

  const discount = await prisma.discountCode.findUnique({
    where: { tenantId_code: { tenantId, code: normalized } },
  });

  if (!discount || !discount.isActive) {
    return { valid: false, error: "Código no válido" };
  }

  const now = new Date();

  if (discount.validFrom && now < discount.validFrom) {
    return { valid: false, error: "Este código aún no es válido" };
  }
  if (discount.validUntil && now > discount.validUntil) {
    return { valid: false, error: "Este código ha expirado" };
  }
  if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) {
    return { valid: false, error: "Este código ha alcanzado su límite de usos" };
  }

  if (userId && discount.maxUsesPerUser !== null) {
    const userUseCount = await prisma.discountRedemption.count({
      where: { discountCodeId: discount.id, userId },
    });
    if (userUseCount >= discount.maxUsesPerUser) {
      return { valid: false, error: "Ya usaste este código el máximo de veces" };
    }
  }

  if (
    discount.packageIds.length > 0 &&
    !discount.packageIds.includes(packageId)
  ) {
    return { valid: false, error: "Este código no aplica para este paquete" };
  }

  if (discount.minPurchase !== null && packagePrice < discount.minPurchase) {
    return { valid: false, error: `Compra mínima de ${discount.minPurchase} requerida` };
  }

  let discountAmount: number;
  if (discount.type === "PERCENTAGE") {
    discountAmount = Math.round(packagePrice * (discount.value / 100) * 100) / 100;
  } else {
    discountAmount = Math.min(discount.value, packagePrice);
  }

  const finalAmount = Math.max(0, Math.round((packagePrice - discountAmount) * 100) / 100);

  return {
    valid: true,
    discountId: discount.id,
    discountAmount,
    finalAmount,
    stripeCouponId: discount.stripeCouponId,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packageId, email, name, paymentMethodId, discountCode } = body;

    if (!packageId) {
      return NextResponse.json(
        { error: "packageId is required" },
        { status: 400 },
      );
    }

    const tenant = await requireTenant();
    let userId: string | null = null;

    try {
      const ctx = await requireAuth();
      userId = ctx.session.user!.id!;
    } catch {
      // Guest purchase allowed
    }

    if (!userId && (!email || !name)) {
      return NextResponse.json(
        { error: "email and name are required for new users" },
        { status: 400 },
      );
    }

    const pkg = await prisma.package.findUnique({
      where: { id: packageId },
      include: { creditAllocations: true },
    });

    if (!pkg || !pkg.isActive || pkg.tenantId !== tenant.id) {
      return NextResponse.json(
        { error: "Paquete no encontrado" },
        { status: 404 },
      );
    }

    if (userId && pkg.countryId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { countryId: true },
      });
      if (user?.countryId && user.countryId !== pkg.countryId) {
        return NextResponse.json(
          { error: "Este paquete no está disponible en tu país" },
          { status: 403 },
        );
      }
    }

    // Validate discount code if provided
    let discountResult: Awaited<ReturnType<typeof validateAndApplyDiscount>> | null = null;
    let effectivePrice = pkg.price;

    if (discountCode) {
      discountResult = await validateAndApplyDiscount(
        discountCode,
        tenant.id,
        packageId,
        pkg.price,
        userId,
      );

      if (!discountResult.valid) {
        return NextResponse.json(
          { error: discountResult.error },
          { status: 400 },
        );
      }

      effectivePrice = discountResult.finalAmount!;
    }

    // Resolve user
    let finalUserId = userId;
    if (!finalUserId) {
      let user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user) {
        user = await prisma.user.create({
          data: { email: email.toLowerCase(), name },
        });
      }
      finalUserId = user.id;
    }

    if (await userHasOpenDebt(finalUserId, tenant.id)) {
      return NextResponse.json(
        {
          error:
            "Tienes un saldo pendiente con el estudio. Contacta a administración para resolverlo antes de comprar.",
        },
        { status: 403 },
      );
    }

    const hasAllocations = pkg.creditAllocations.length > 0;

    // If tenant has Stripe Connect, create a real PaymentIntent
    if (tenant.stripeAccountId && effectivePrice > 0) {
      try {
        const purchasedAt = new Date();
        const expiresAt = new Date(purchasedAt);
        expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

        const userPackage = await prisma.userPackage.create({
          data: {
            userId: finalUserId,
            packageId: pkg.id,
            tenantId: tenant.id,
            creditsTotal: hasAllocations ? null : pkg.credits,
            creditsUsed: 0,
            expiresAt,
            stripePaymentId: "pending_stripe",
            status: "PENDING_PAYMENT",
            purchasedAt,
          },
        });

        if (hasAllocations) {
          await createCreditUsagesForPackage(userPackage.id, pkg.id);
        }

        // Record discount redemption
        if (discountResult?.discountId) {
          await prisma.$transaction([
            prisma.discountRedemption.create({
              data: {
                discountCodeId: discountResult.discountId,
                userId: finalUserId,
                userPackageId: userPackage.id,
                originalAmount: pkg.price,
                discountAmount: discountResult.discountAmount!,
                finalAmount: effectivePrice,
              },
            }),
            prisma.discountCode.update({
              where: { id: discountResult.discountId },
              data: { usedCount: { increment: 1 } },
            }),
          ]);
        }

        const paymentIntent = await createMemberPayment({
          tenantId: tenant.id,
          memberId: finalUserId,
          amountInCurrency: effectivePrice,
          type: "membership",
          referenceId: userPackage.id,
          description: `Paquete ${pkg.name}${discountCode ? ` (código: ${discountCode.toUpperCase()})` : ""}`,
          paymentMethodId,
        });

        if (paymentMethodId && paymentIntent.status === "succeeded") {
          await prisma.userPackage.update({
            where: { id: userPackage.id },
            data: { status: "ACTIVE", stripePaymentId: paymentIntent.id },
          });
          return NextResponse.json({
            success: true,
            requiresPayment: false,
            packageName: pkg.name,
            credits: pkg.credits,
            discountApplied: discountResult
              ? {
                  code: discountCode,
                  discountAmount: discountResult.discountAmount,
                  originalPrice: pkg.price,
                  finalPrice: effectivePrice,
                }
              : null,
          });
        }

        return NextResponse.json({
          success: true,
          requiresPayment: true,
          clientSecret: paymentIntent.client_secret,
          stripeAccountId: tenant.stripeAccountId,
          packageName: pkg.name,
          credits: pkg.credits,
          amount: effectivePrice,
          discountApplied: discountResult
            ? {
                code: discountCode,
                discountAmount: discountResult.discountAmount,
                originalPrice: pkg.price,
                finalPrice: effectivePrice,
              }
            : null,
        });
      } catch (e) {
        console.error("Stripe payment failed, falling back to simulated:", e);
      }
    }

    // Fallback: simulated purchase (no Stripe connected or free/fully-discounted package)
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

    const simPkg = await prisma.userPackage.create({
      data: {
        userId: finalUserId,
        packageId: pkg.id,
        tenantId: tenant.id,
        creditsTotal: hasAllocations ? null : pkg.credits,
        creditsUsed: 0,
        expiresAt,
        stripePaymentId: effectivePrice === 0 ? `discount_free_${Date.now()}` : `sim_${Date.now()}`,
        purchasedAt,
      },
    });

    if (hasAllocations) {
      await createCreditUsagesForPackage(simPkg.id, pkg.id);
    }

    // Record discount redemption for free/simulated path
    if (discountResult?.discountId) {
      await prisma.$transaction([
        prisma.discountRedemption.create({
          data: {
            discountCodeId: discountResult.discountId,
            userId: finalUserId,
            userPackageId: simPkg.id,
            originalAmount: pkg.price,
            discountAmount: discountResult.discountAmount!,
            finalAmount: effectivePrice,
          },
        }),
        prisma.discountCode.update({
          where: { id: discountResult.discountId },
          data: { usedCount: { increment: 1 } },
        }),
      ]);
    }

    return NextResponse.json({
      success: true,
      requiresPayment: false,
      packageName: pkg.name,
      credits: pkg.credits,
      discountApplied: discountResult
        ? {
            code: discountCode,
            discountAmount: discountResult.discountAmount,
            originalPrice: pkg.price,
            finalPrice: effectivePrice,
          }
        : null,
    });
  } catch (error) {
    console.error("POST /api/packages/purchase error:", error);
    return NextResponse.json(
      { error: "Error al procesar la compra" },
      { status: 500 },
    );
  }
}
