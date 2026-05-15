import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { onStripePaymentSucceeded, voidCommissionsForSale } from "@/lib/staff";
import { requireStaffManagement } from "../../../../_auth";

// Attribute a sale to a staff member (or clear the attribution). Currently
// only supports Stripe payments — POS sales are auto-attributed via
// PosTransaction.processedById at sale time.
//
// POST /api/admin/staff/payments/stripe/:id/attribute
// body: { userId: string | null }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { type, id } = await params;
    if (type !== "stripe") {
      return NextResponse.json(
        { error: "Sólo soportado para pagos online (stripe)" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const newUserId: string | null = body?.userId ?? null;

    const payment = await prisma.stripePayment.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Validate the user is a staff member of this tenant.
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
    if (newUserId) {
      created = await onStripePaymentSucceeded(payment.id);
    }

    return NextResponse.json({ success: true, earningsCreated: created });
  } catch (error) {
    console.error("POST attribute sale error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
