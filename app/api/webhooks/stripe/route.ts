import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 },
      );
    }

    const event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { packageId, userId, tenantId } = session.metadata ?? {};

      if (!packageId || !userId || !tenantId) {
        console.error("Stripe webhook missing metadata:", session.metadata);
        return NextResponse.json({ received: true });
      }

      const pkg = await prisma.package.findFirst({
        where: { id: packageId, tenantId },
      });

      if (!pkg) {
        console.error("Package not found for webhook:", packageId);
        return NextResponse.json({ received: true });
      }

      const purchasedAt = new Date();
      const expiresAt = new Date(purchasedAt);
      expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

      await prisma.userPackage.create({
        data: {
          userId,
          packageId: pkg.id,
          tenantId,
          creditsTotal: pkg.credits,
          creditsUsed: 0,
          expiresAt,
          stripePaymentId: session.payment_intent as string | null,
          purchasedAt,
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("POST /api/webhooks/stripe error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 400 },
    );
  }
}
