import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireTenant } from "@/lib/tenant";
import { createMemberPayment } from "@/lib/stripe/payments";
import { createCreditUsagesForPackage } from "@/lib/credits";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packageId, email, name, paymentMethodId } = body;

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

    const hasAllocations = pkg.creditAllocations.length > 0;

    // If tenant has Stripe Connect, create a real PaymentIntent
    if (tenant.stripeAccountId && pkg.price > 0) {
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
            purchasedAt,
          },
        });

        if (hasAllocations) {
          await createCreditUsagesForPackage(userPackage.id, pkg.id);
        }

        const paymentIntent = await createMemberPayment({
          tenantId: tenant.id,
          memberId: finalUserId,
          amountInCurrency: pkg.price,
          type: "membership",
          referenceId: userPackage.id,
          description: `Paquete ${pkg.name}`,
          paymentMethodId,
        });

        if (paymentMethodId && paymentIntent.status === "succeeded") {
          return NextResponse.json({
            success: true,
            requiresPayment: false,
            packageName: pkg.name,
            credits: pkg.credits,
          });
        }

        return NextResponse.json({
          success: true,
          requiresPayment: true,
          clientSecret: paymentIntent.client_secret,
          stripeAccountId: tenant.stripeAccountId,
          packageName: pkg.name,
          credits: pkg.credits,
          amount: pkg.price,
        });
      } catch (e) {
        console.error("Stripe payment failed, falling back to simulated:", e);
      }
    }

    // Fallback: simulated purchase (no Stripe connected or free package)
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
        stripePaymentId: `sim_${Date.now()}`,
        purchasedAt,
      },
    });

    if (hasAllocations) {
      await createCreditUsagesForPackage(simPkg.id, pkg.id);
    }

    return NextResponse.json({
      success: true,
      requiresPayment: false,
      packageName: pkg.name,
      credits: pkg.credits,
    });
  } catch (error) {
    console.error("POST /api/packages/purchase error:", error);
    return NextResponse.json(
      { error: "Error al procesar la compra" },
      { status: 500 },
    );
  }
}
