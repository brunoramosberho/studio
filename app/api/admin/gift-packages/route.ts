import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { createCreditUsagesForPackage } from "@/lib/credits";

// GET /api/admin/gift-packages — list all gift packages for audit
export async function GET() {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const gifts = await prisma.giftPackage.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: "desc" },
    });

    // Enrich with user, package, and admin info
    const userIds = [
      ...new Set([
        ...gifts.map((g) => g.recipientId),
        ...gifts.map((g) => g.giftedById),
      ]),
    ];
    const packageIds = [...new Set(gifts.map((g) => g.packageId))];

    const [users, packages] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, image: true },
      }),
      prisma.package.findMany({
        where: { id: { in: packageIds } },
        select: { id: true, name: true, price: true, currency: true, credits: true },
      }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const pkgMap = new Map(packages.map((p) => [p.id, p]));

    const enriched = gifts.map((g) => ({
      ...g,
      recipient: userMap.get(g.recipientId) || null,
      package: pkgMap.get(g.packageId) || null,
      giftedBy: userMap.get(g.giftedById) || null,
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/admin/gift-packages error:", error);
    return NextResponse.json(
      { error: "Error al obtener regalos" },
      { status: 500 },
    );
  }
}

// POST /api/admin/gift-packages — gift a package to a client
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const tenantId = ctx.tenant.id;
    const adminUserId = ctx.session.user.id;

    const body = await request.json();
    const { recipientId, packageId, reason, notes } = body;

    if (!recipientId || !packageId) {
      return NextResponse.json(
        { error: "recipientId y packageId son requeridos" },
        { status: 400 },
      );
    }

    // Validate recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, name: true, email: true },
    });

    if (!recipient) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 },
      );
    }

    // Validate package exists
    const pkg = await prisma.package.findFirst({
      where: { id: packageId, tenantId },
      include: { creditAllocations: true },
    });

    if (!pkg) {
      return NextResponse.json(
        { error: "Paquete no encontrado" },
        { status: 404 },
      );
    }

    // Create UserPackage (the actual credits/access)
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

    const hasAllocations = pkg.creditAllocations.length > 0;

    const userPackage = await prisma.userPackage.create({
      data: {
        userId: recipientId,
        packageId: pkg.id,
        tenantId,
        creditsTotal: hasAllocations ? null : pkg.credits,
        creditsUsed: 0,
        expiresAt,
        stripePaymentId: `gift_${adminUserId}_${Date.now()}`,
        purchasedAt,
      },
    });

    if (hasAllocations) {
      await createCreditUsagesForPackage(userPackage.id, pkg.id);
    }

    // Create audit record
    const gift = await prisma.giftPackage.create({
      data: {
        tenantId,
        recipientId,
        packageId: pkg.id,
        userPackageId: userPackage.id,
        giftedById: adminUserId,
        reason: reason || null,
        notes: notes || null,
      },
    });

    // Update membership lifecycle if needed
    const membership = await prisma.membership.findUnique({
      where: {
        userId_tenantId: { userId: recipientId, tenantId },
      },
    });

    if (membership && !membership.firstPurchaseAt) {
      await prisma.membership.update({
        where: {
          userId_tenantId: { userId: recipientId, tenantId },
        },
        data: { firstPurchaseAt: new Date() },
      });
    }

    return NextResponse.json(
      {
        success: true,
        gift,
        userPackage: {
          id: userPackage.id,
          creditsTotal: userPackage.creditsTotal,
          expiresAt: userPackage.expiresAt,
        },
        recipientName: recipient.name,
        packageName: pkg.name,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/admin/gift-packages error:", error);
    return NextResponse.json(
      { error: "Error al regalar paquete" },
      { status: 500 },
    );
  }
}
