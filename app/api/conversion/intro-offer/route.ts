import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { getConversionConfig } from "@/lib/conversion/nudge-engine";
import { addHours } from "date-fns";

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;
    const tenantId = tenant.id;

    const body = await request.json();
    const { membershipId } = body as { membershipId?: string };

    const existing = await prisma.introOfferClaim.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (existing) {
      return NextResponse.json(existing);
    }

    const config = await getConversionConfig(tenantId);
    const targetMembershipId = membershipId ?? config.introOfferMembershipId;

    let normalPrice = 0;
    if (targetMembershipId) {
      const pkg = await prisma.package.findUnique({
        where: { id: targetMembershipId },
        select: { price: true },
      });
      normalPrice = pkg?.price ?? 0;
    }

    const claim = await prisma.introOfferClaim.create({
      data: {
        tenantId,
        userId,
        expiresAt: addHours(new Date(), config.introOfferTimerHours),
        introPrice: config.introOfferPrice,
        normalPrice,
      },
    });

    return NextResponse.json(claim, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("POST /api/conversion/intro-offer error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;
    const tenantId = tenant.id;

    const body = await request.json();
    const { action } = body as { action: "accept" | "reject" };

    if (!action || !["accept", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'accept' or 'reject'" },
        { status: 400 },
      );
    }

    const claim = await prisma.introOfferClaim.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!claim) {
      return NextResponse.json(
        { error: "No intro offer found" },
        { status: 404 },
      );
    }

    if (claim.acceptedAt || claim.rejectedAt) {
      return NextResponse.json(
        { error: "Offer already resolved" },
        { status: 409 },
      );
    }

    if (action === "reject") {
      const updated = await prisma.introOfferClaim.update({
        where: { id: claim.id },
        data: { rejectedAt: new Date() },
      });

      await prisma.nudgeEvent.create({
        data: {
          tenantId,
          userId,
          type: "intro_offer",
          shown: true,
          interacted: true,
          interactedAt: new Date(),
          converted: false,
        },
      });

      return NextResponse.json(updated);
    }

    // Accept: create subscription
    const config = await getConversionConfig(tenantId);
    const membershipId = config.introOfferMembershipId;

    if (!membershipId) {
      return NextResponse.json(
        { error: "No membership configured for intro offer" },
        { status: 400 },
      );
    }

    const pkg = await prisma.package.findUnique({
      where: { id: membershipId },
    });

    if (!pkg) {
      return NextResponse.json(
        { error: "Membership package not found" },
        { status: 404 },
      );
    }

    const [updatedClaim, userPackage] = await prisma.$transaction([
      prisma.introOfferClaim.update({
        where: { id: claim.id },
        data: { acceptedAt: new Date() },
      }),
      // TODO: Stripe — conectar pago
      // Cuando Stripe esté integrado, este bloque debe:
      // 1. Obtener o crear Stripe Customer del miembro
      // 2. Crear PaymentIntent:
      //    - amount: claim.introPrice * 100 (centavos)
      //    - currency: pkg.currency
      //    - customer: member.stripeCustomerId
      //    - payment_method: member.defaultPaymentMethodId (si existe)
      //    - confirm: true (si hay método guardado)
      //    - off_session: false (estamos en sesión activa)
      // 3. Si falla: revertir IntroOfferClaim.acceptedAt, retornar error
      // 4. Si OK: actualizar UserPackage con stripePaymentId
      //
      // Por ahora: crear UserPackage con stripePaymentId='pending_stripe'
      prisma.userPackage.create({
        data: {
          userId,
          packageId: membershipId,
          tenantId,
          creditsTotal: pkg.credits,
          expiresAt: new Date(
            Date.now() + pkg.validDays * 24 * 60 * 60 * 1000,
          ),
          stripePaymentId: "pending_stripe",
        },
      }),
    ]);

    await prisma.nudgeEvent.create({
      data: {
        tenantId,
        userId,
        type: "intro_offer",
        shown: true,
        interacted: true,
        interactedAt: new Date(),
        converted: true,
        convertedAt: new Date(),
        membershipId,
        revenue: claim.introPrice,
      },
    });

    return NextResponse.json({ claim: updatedClaim, userPackage });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("PATCH /api/conversion/intro-offer error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
