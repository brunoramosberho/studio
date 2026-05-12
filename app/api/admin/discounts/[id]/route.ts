import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

// PUT /api/admin/discounts/[id] — update a discount code
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.discountCode.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Descuento no encontrado" },
        { status: 404 },
      );
    }

    const {
      description,
      type,
      value,
      currency,
      maxUses,
      maxUsesPerUser,
      minPurchase,
      validFrom,
      validUntil,
      isActive,
      packageIds,
    } = body;

    const discount = await prisma.discountCode.update({
      where: { id },
      data: {
        ...(description !== undefined && { description }),
        ...(type !== undefined && { type }),
        ...(value !== undefined && { value }),
        ...(currency !== undefined && { currency }),
        ...(maxUses !== undefined && { maxUses }),
        ...(maxUsesPerUser !== undefined && { maxUsesPerUser }),
        ...(minPurchase !== undefined && { minPurchase }),
        ...(validFrom !== undefined && { validFrom: new Date(validFrom) }),
        ...(validUntil !== undefined && {
          validUntil: validUntil ? new Date(validUntil) : null,
        }),
        ...(isActive !== undefined && { isActive }),
        ...(packageIds !== undefined && { packageIds }),
      },
    });

    return NextResponse.json(discount);
  } catch (error) {
    console.error("PUT /api/admin/discounts/[id] error:", error);
    return NextResponse.json(
      { error: "Error al actualizar descuento" },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/discounts/[id] — deactivate a discount code
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const existing = await prisma.discountCode.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Descuento no encontrado" },
        { status: 404 },
      );
    }

    // Deactivate instead of hard-deleting to preserve redemption history
    await prisma.discountCode.update({
      where: { id },
      data: { isActive: false },
    });

    // Deactivate Stripe coupon if exists
    if (existing.stripeCouponId && ctx.tenant.stripeAccountId) {
      try {
        const { getStripeClientForTenantId } = await import(
          "@/lib/stripe/tenant-stripe"
        );
        const stripe = await getStripeClientForTenantId(ctx.tenant.id);
        await stripe.coupons.del(existing.stripeCouponId, {
          stripeAccount: ctx.tenant.stripeAccountId,
        });
      } catch (stripeErr) {
        console.error("Failed to delete Stripe coupon:", stripeErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/discounts/[id] error:", error);
    return NextResponse.json(
      { error: "Error al eliminar descuento" },
      { status: 500 },
    );
  }
}
