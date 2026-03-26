import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireTenant } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packageId, email, name } = body;

    if (!packageId) {
      return NextResponse.json(
        { error: "packageId is required" },
        { status: 400 },
      );
    }

    const tenant = await requireTenant();
    let session: Awaited<ReturnType<typeof requireAuth>>["session"] | null = null;
    let userId: string | null = null;

    try {
      const ctx = await requireAuth();
      session = ctx.session;
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

    // Stripe checkout (if configured)
    if (userId && process.env.STRIPE_SECRET_KEY) {
      const { createCheckoutSession } = await import("@/lib/stripe");
      const origin = request.nextUrl.origin;
      const checkoutSession = await createCheckoutSession({
        packageId: pkg.id,
        packageName: pkg.name,
        price: pkg.price,
        userId,
        tenantId: tenant.id,
        successUrl: `${origin}/packages/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/packages`,
      });
      return NextResponse.json({ url: checkoutSession.url });
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

    // Simulated purchase
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

    await prisma.userPackage.create({
      data: {
        userId: finalUserId,
        packageId: pkg.id,
        tenantId: tenant.id,
        creditsTotal: pkg.credits,
        creditsUsed: 0,
        expiresAt,
        stripePaymentId: `sim_${Date.now()}`,
        purchasedAt,
      },
    });

    return NextResponse.json({
      simulated: true,
      success: true,
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
