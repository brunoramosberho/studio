import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// POST /api/discounts/validate — validate a discount code for a package purchase
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const body = await request.json();
    const { code, packageId, userId } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Código requerido" },
        { status: 400 },
      );
    }

    const normalizedCode = code.trim().toUpperCase();

    const discount = await prisma.discountCode.findUnique({
      where: {
        tenantId_code: { tenantId: tenant.id, code: normalizedCode },
      },
    });

    if (!discount || !discount.isActive) {
      return NextResponse.json(
        { valid: false, error: "Código no válido" },
        { status: 200 },
      );
    }

    const now = new Date();

    // Check date validity
    if (discount.validFrom && now < discount.validFrom) {
      return NextResponse.json(
        { valid: false, error: "Este código aún no es válido" },
        { status: 200 },
      );
    }

    if (discount.validUntil && now > discount.validUntil) {
      return NextResponse.json(
        { valid: false, error: "Este código ha expirado" },
        { status: 200 },
      );
    }

    // Check max uses
    if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) {
      return NextResponse.json(
        { valid: false, error: "Este código ha alcanzado su límite de usos" },
        { status: 200 },
      );
    }

    // Check per-user limit
    if (userId && discount.maxUsesPerUser !== null) {
      const userUseCount = await prisma.discountRedemption.count({
        where: { discountCodeId: discount.id, userId },
      });
      if (userUseCount >= discount.maxUsesPerUser) {
        return NextResponse.json(
          { valid: false, error: "Ya has usado este código el máximo de veces permitido" },
          { status: 200 },
        );
      }
    }

    // Check package restriction
    if (
      packageId &&
      discount.packageIds.length > 0 &&
      !discount.packageIds.includes(packageId)
    ) {
      return NextResponse.json(
        { valid: false, error: "Este código no aplica para este paquete" },
        { status: 200 },
      );
    }

    // If we need to check the package for minPurchase
    let packagePrice: number | null = null;
    if (packageId) {
      const pkg = await prisma.package.findUnique({
        where: { id: packageId },
        select: { price: true },
      });
      packagePrice = pkg?.price ?? null;
    }

    if (
      discount.minPurchase !== null &&
      packagePrice !== null &&
      packagePrice < discount.minPurchase
    ) {
      return NextResponse.json(
        {
          valid: false,
          error: `Compra mínima de ${discount.minPurchase} ${discount.currency || ""} requerida`,
        },
        { status: 200 },
      );
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (packagePrice !== null) {
      if (discount.type === "PERCENTAGE") {
        discountAmount = Math.round(packagePrice * (discount.value / 100) * 100) / 100;
      } else {
        discountAmount = Math.min(discount.value, packagePrice);
      }
    }

    return NextResponse.json({
      valid: true,
      discountId: discount.id,
      code: discount.code,
      type: discount.type,
      value: discount.value,
      description: discount.description,
      discountAmount,
      finalAmount:
        packagePrice !== null
          ? Math.max(0, Math.round((packagePrice - discountAmount) * 100) / 100)
          : null,
    });
  } catch (error) {
    console.error("POST /api/discounts/validate error:", error);
    return NextResponse.json(
      { error: "Error al validar código" },
      { status: 500 },
    );
  }
}
