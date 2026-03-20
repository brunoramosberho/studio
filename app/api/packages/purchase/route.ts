import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/stripe";

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
  } catch (error) {
    console.error("POST /api/packages/purchase error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
