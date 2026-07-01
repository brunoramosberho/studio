import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  onPosTransactionCompleted,
  onStripePaymentSucceeded,
  voidCommissionsForSale,
} from "@/lib/staff";
import { requireStaffManagement } from "../../../../_auth";

// Attribute a sale to a staff member (or clear the attribution) so commission
// can be credited to whoever actually made the sale. Supports both:
//   - stripe: online payments, attributed via StripePayment.soldByUserId
//   - pos:    in-person/manual sales, attributed via PosTransaction.processedById
//
// Changing the attribution voids the prior seller's earnings on this sale and
// re-accrues for the new seller (per their own commission rules). Clearing
// (userId: null) just voids and leaves the sale unattributed.
//
// POST /api/admin/staff/payments/{stripe|pos}/:id/attribute
// body: { userId: string | null }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { type, id } = await params;
    if (type !== "stripe" && type !== "pos") {
      return NextResponse.json(
        { error: "Tipo de venta no soportado" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const newUserId: string | null = body?.userId ?? null;

    // Validate the new seller is a staff member of this tenant.
    if (newUserId) {
      const membership = await prisma.membership.findFirst({
        where: {
          userId: newUserId,
          tenantId: ctx.tenant.id,
          role: { in: ["FRONT_DESK", "ADMIN"] },
        },
        select: { id: true },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "El usuario no es staff de este estudio" },
          { status: 400 },
        );
      }
    }

    if (type === "stripe") {
      const payment = await prisma.stripePayment.findFirst({
        where: { id, tenantId: ctx.tenant.id },
      });
      if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // If we're changing the attribution, void prior earnings on this payment.
      if (payment.soldByUserId && payment.soldByUserId !== newUserId) {
        await voidCommissionsForSale({
          stripePaymentId: payment.id,
          reason: `attribution changed by admin (was ${payment.soldByUserId})`,
        });
      }

      await prisma.stripePayment.update({
        where: { id: payment.id },
        data: { soldByUserId: newUserId },
      });

      let created = 0;
      if (newUserId) created = await onStripePaymentSucceeded(payment.id);
      return NextResponse.json({ success: true, earningsCreated: created });
    }

    // type === "pos"
    const tx = await prisma.posTransaction.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // If we're changing the seller, void the prior seller's earnings.
    if (tx.processedById && tx.processedById !== newUserId) {
      await voidCommissionsForSale({
        posTransactionId: tx.id,
        reason: `attribution changed by admin (was ${tx.processedById})`,
      });
    }

    await prisma.posTransaction.update({
      where: { id: tx.id },
      data: { processedById: newUserId },
    });

    let created = 0;
    if (newUserId) created = await onPosTransactionCompleted(tx.id);
    return NextResponse.json({ success: true, earningsCreated: created });
  } catch (error) {
    console.error("POST attribute sale error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
