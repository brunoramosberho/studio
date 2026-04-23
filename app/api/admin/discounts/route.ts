import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, getTenantCurrency } from "@/lib/tenant";

// GET /api/admin/discounts — list all discount codes for tenant
export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const discounts = await prisma.discountCode.findMany({
      where: { tenantId: ctx.tenant.id },
      include: {
        _count: { select: { redemptions: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(discounts);
  } catch (error) {
    console.error("GET /api/admin/discounts error:", error);
    return NextResponse.json(
      { error: "Error al obtener descuentos" },
      { status: 500 },
    );
  }
}

// POST /api/admin/discounts — create a new discount code
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const body = await request.json();

    const {
      code,
      description,
      type,
      value,
      currency,
      maxUses,
      maxUsesPerUser,
      minPurchase,
      validFrom,
      validUntil,
      packageIds,
    } = body;

    if (!code || !type || value == null) {
      return NextResponse.json(
        { error: "code, type y value son requeridos" },
        { status: 400 },
      );
    }

    const normalizedCode = code.trim().toUpperCase();

    // Check for duplicate code
    const existing = await prisma.discountCode.findUnique({
      where: {
        tenantId_code: { tenantId: ctx.tenant.id, code: normalizedCode },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un código con ese nombre" },
        { status: 409 },
      );
    }

    // Validate type-specific rules
    if (type === "PERCENTAGE" && (value < 0 || value > 100)) {
      return NextResponse.json(
        { error: "El porcentaje debe estar entre 0 y 100" },
        { status: 400 },
      );
    }

    if (type === "FIXED_AMOUNT" && !currency) {
      return NextResponse.json(
        { error: "La moneda es requerida para descuentos de monto fijo" },
        { status: 400 },
      );
    }

    // Create Stripe coupon if tenant has Stripe connected
    let stripeCouponId: string | null = null;
    if (ctx.tenant.stripeAccountId) {
      try {
        const { getStripe } = await import("@/lib/stripe/client");
        const stripe = getStripe();
        const couponData: Record<string, unknown> = {
          name: `${normalizedCode} — ${description || normalizedCode}`,
          metadata: { tenantId: ctx.tenant.id, code: normalizedCode },
        };

        if (type === "PERCENTAGE") {
          couponData.percent_off = value;
        } else {
          couponData.amount_off = Math.round(value * 100); // cents
          const fallbackCurrency = (await getTenantCurrency()).code;
          couponData.currency = (currency || fallbackCurrency).toLowerCase();
        }

        if (maxUses) {
          couponData.max_redemptions = maxUses;
        }

        if (validUntil) {
          couponData.redeem_by = Math.floor(
            new Date(validUntil).getTime() / 1000,
          );
        }

        const coupon = await stripe.coupons.create(couponData, {
          stripeAccount: ctx.tenant.stripeAccountId,
        });

        stripeCouponId = coupon.id;
      } catch (stripeErr) {
        console.error("Failed to create Stripe coupon:", stripeErr);
        // Continue without Stripe coupon — the discount works locally
      }
    }

    const discount = await prisma.discountCode.create({
      data: {
        tenantId: ctx.tenant.id,
        code: normalizedCode,
        description: description || null,
        type,
        value,
        currency: currency || null,
        maxUses: maxUses || null,
        maxUsesPerUser: maxUsesPerUser || null,
        minPurchase: minPurchase || null,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validUntil: validUntil ? new Date(validUntil) : null,
        packageIds: packageIds || [],
        stripeCouponId,
      },
    });

    return NextResponse.json(discount, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/discounts error:", error);
    return NextResponse.json(
      { error: "Error al crear descuento" },
      { status: 500 },
    );
  }
}
