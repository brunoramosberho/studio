import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { createMemberPayment } from "@/lib/stripe/payments";

const MAX_QUANTITY_PER_ITEM = 10;
const MAX_LINE_ITEMS = 20;

interface IncomingItem {
  productId?: unknown;
  quantity?: unknown;
}

async function getBookingWithStudio(bookingId: string, tenantId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, tenantId },
    include: {
      class: {
        include: {
          room: { include: { studio: true } },
        },
      },
      productOrder: { include: { items: true } },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { id } = await params;

    const booking = await getBookingWithStudio(id, tenant.id);
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    if (booking.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const studio = booking.class.room.studio;
    if (!studio.productsEnabled) {
      return NextResponse.json({
        studio: { id: studio.id, name: studio.name, productsEnabled: false },
        products: [],
        existingOrder: booking.productOrder,
      });
    }

    const products = await prisma.product.findMany({
      where: {
        tenantId: tenant.id,
        availableForPreOrder: true,
        isActive: true,
        OR: [
          { studioAvailability: { none: {} } },
          { studioAvailability: { some: { studioId: studio.id } } },
        ],
      },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      studio: {
        id: studio.id,
        name: studio.name,
        productsEnabled: true,
      },
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        imageUrl: p.imageUrl,
        category: p.category,
      })),
      existingOrder: booking.productOrder,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { id } = await params;

    const booking = await getBookingWithStudio(id, tenant.id);
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    if (booking.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (booking.productOrder) {
      return NextResponse.json(
        { error: "An order already exists for this booking" },
        { status: 409 },
      );
    }

    const studio = booking.class.room.studio;
    if (!studio.productsEnabled) {
      return NextResponse.json(
        { error: "Pre-orders are not enabled at this studio" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const rawItems: IncomingItem[] = Array.isArray(body?.items) ? body.items : [];
    const notes: string | null =
      typeof body?.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim().slice(0, 500)
        : null;
    const paymentMethodId: string | undefined =
      typeof body?.paymentMethodId === "string" ? body.paymentMethodId : undefined;

    if (rawItems.length === 0 || rawItems.length > MAX_LINE_ITEMS) {
      return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    }

    const cleanItems: { productId: string; quantity: number }[] = [];
    for (const it of rawItems) {
      const productId = typeof it.productId === "string" ? it.productId : null;
      const quantity = Number.isFinite(Number(it.quantity)) ? Math.floor(Number(it.quantity)) : 0;
      if (!productId || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
        return NextResponse.json({ error: "Invalid item entry" }, { status: 400 });
      }
      cleanItems.push({ productId, quantity });
    }

    const productIds = cleanItems.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        tenantId: tenant.id,
        availableForPreOrder: true,
        isActive: true,
      },
      include: { studioAvailability: { select: { studioId: true } } },
    });

    if (products.length !== new Set(productIds).size) {
      return NextResponse.json({ error: "One or more products are unavailable" }, { status: 400 });
    }

    for (const p of products) {
      const limited = p.studioAvailability.length > 0;
      if (limited && !p.studioAvailability.some((s) => s.studioId === studio.id)) {
        return NextResponse.json(
          { error: `${p.name} is not available at this studio` },
          { status: 400 },
        );
      }
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    let subtotalCents = 0;
    let currency: string | null = null;
    const itemsToCreate = cleanItems.map((it) => {
      const p = productMap.get(it.productId)!;
      const unitPriceCents = Math.round(p.price * 100);
      if (currency && currency !== p.currency) {
        throw new Error("Mixed-currency orders are not supported");
      }
      currency = p.currency;
      subtotalCents += unitPriceCents * it.quantity;
      return {
        productId: p.id,
        nameSnapshot: p.name,
        unitPriceCents,
        quantity: it.quantity,
      };
    });

    if (!currency || subtotalCents <= 0) {
      return NextResponse.json({ error: "Invalid order total" }, { status: 400 });
    }

    const order = await prisma.bookingProductOrder.create({
      data: {
        tenantId: tenant.id,
        bookingId: booking.id,
        userId: session.user.id,
        studioId: studio.id,
        status: "PENDING_PAYMENT",
        pickupAt: booking.class.endsAt,
        notes,
        subtotalCents,
        currency,
        items: { create: itemsToCreate },
      },
      include: { items: true },
    });

    let paymentIntentClientSecret: string | null = null;
    let paymentIntentId: string | null = null;
    let paymentStatus: string | null = null;

    try {
      const intent = await createMemberPayment({
        tenantId: tenant.id,
        memberId: session.user.id,
        amountInCurrency: subtotalCents / 100,
        type: "product",
        referenceId: order.id,
        description: `Pre-orden bar — ${booking.class.id}`,
        concept: itemsToCreate.map((i) => `${i.quantity}× ${i.nameSnapshot}`).join(", "),
        currency,
        paymentMethodId,
      });

      paymentIntentClientSecret = intent.client_secret ?? null;
      paymentIntentId = intent.id;
      paymentStatus = intent.status;

      const stripePayment = await prisma.stripePayment.findUnique({
        where: { stripePaymentIntentId: intent.id },
      });

      const updates: Parameters<typeof prisma.bookingProductOrder.update>[0]["data"] = {
        ...(stripePayment ? { stripePaymentId: stripePayment.id } : {}),
      };
      if (intent.status === "succeeded") {
        updates.status = "PAID";
        updates.paidAt = new Date();
      }
      if (Object.keys(updates).length > 0) {
        await prisma.bookingProductOrder.update({
          where: { id: order.id },
          data: updates,
        });
      }
    } catch (paymentErr) {
      console.error("Pre-order payment failed", paymentErr);
      // Roll the order back so the member can retry without a duplicate.
      await prisma.bookingProductOrder.delete({ where: { id: order.id } }).catch(() => {});
      return NextResponse.json(
        { error: "Payment failed. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      orderId: order.id,
      subtotalCents,
      currency,
      paymentIntentId,
      paymentIntentClientSecret,
      paymentStatus,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
