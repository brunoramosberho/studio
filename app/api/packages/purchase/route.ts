import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { packageId } = body;

    if (!packageId) {
      return NextResponse.json(
        { error: "packageId is required" },
        { status: 400 },
      );
    }

    const pkg = await prisma.package.findUnique({
      where: { id: packageId },
    });

    if (!pkg || !pkg.isActive) {
      return NextResponse.json(
        { error: "Package not found or inactive" },
        { status: 404 },
      );
    }

    if (process.env.STRIPE_SECRET_KEY) {
      const { createCheckoutSession } = await import("@/lib/stripe");
      const origin = request.nextUrl.origin;
      const checkoutSession = await createCheckoutSession({
        packageId: pkg.id,
        packageName: pkg.name,
        price: pkg.price,
        userId: session.user.id,
        successUrl: `${origin}/packages/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/packages`,
      });
      return NextResponse.json({ url: checkoutSession.url });
    }

    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

    await prisma.userPackage.create({
      data: {
        userId: session.user.id,
        packageId: pkg.id,
        creditsTotal: pkg.credits,
        creditsUsed: 0,
        expiresAt,
        stripePaymentId: `sim_${Date.now()}`,
        purchasedAt,
      },
    });

    return NextResponse.json({ simulated: true, success: true });
  } catch (error) {
    console.error("POST /api/packages/purchase error:", error);
    return NextResponse.json(
      { error: "Failed to process purchase" },
      { status: 500 },
    );
  }
}
