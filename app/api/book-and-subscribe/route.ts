import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { createMemberSubscription } from "@/lib/stripe/subscriptions";
import { attributeShareConversion, getShareCookieCode } from "@/lib/growth/share-links";
import { userHasOpenDebt } from "@/lib/billing/debt";
import { platformBookedNoCompanionWhere } from "@/lib/booking/availability";

/**
 * Starts an inline subscribe-and-book for the (guest) booking flow: creates or
 * finds the account, validates the class has a seat, and creates the Stripe
 * subscription (incomplete). Returns the first-invoice client secret for the
 * client to confirm. The booking itself happens in /book-and-subscribe/finalize
 * once the payment confirms — so no seat is taken until money lands.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const session = await auth();
    const body = await request.json();
    const { packageId, classId } = body;
    const email = body.email?.trim().toLowerCase() ?? null;
    const name =
      body.name?.trim().replace(/\S+/g, (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) ?? null;
    const phone = body.phone?.trim() || null;

    if (!classId || !packageId) {
      return NextResponse.json({ error: "classId and packageId are required" }, { status: 400 });
    }
    const userId = session?.user?.id ?? null;
    if (!userId && (!email || !name)) {
      return NextResponse.json({ error: "email and name are required for new users" }, { status: 400 });
    }

    const pkg = await prisma.package.findUnique({ where: { id: packageId, tenantId: tenant.id } });
    if (!pkg || !pkg.isActive) {
      return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
    }
    if (pkg.type !== "SUBSCRIPTION") {
      return NextResponse.json({ error: "Este flujo es solo para suscripciones." }, { status: 400 });
    }
    if (!tenant.stripeAccountId) {
      return NextResponse.json({ error: "El estudio no tiene pagos configurados." }, { status: 400 });
    }

    // Class must exist + have a free seat (advisory — re-checked at finalize).
    const classData = await prisma.class.findUnique({
      where: { id: classId, tenantId: tenant.id },
      include: {
        room: { select: { maxCapacity: true } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
    });
    if (!classData) return NextResponse.json({ error: "Clase no encontrada" }, { status: 404 });
    if (classData.status === "CANCELLED") {
      return NextResponse.json({ error: "Esta clase fue cancelada" }, { status: 400 });
    }
    const blockedCount = await prisma.blockedSpot.count({ where: { classId } });
    const platformBooked = await prisma.platformBooking.count({ where: platformBookedNoCompanionWhere(classId) });
    if (classData.room.maxCapacity - classData._count.bookings - blockedCount - platformBooked <= 0) {
      return NextResponse.json({ error: "Clase llena", full: true }, { status: 409 });
    }

    // Create / find the account + ensure tenant membership.
    let finalUserId = userId;
    if (!finalUserId) {
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({ data: { email, name, phone } });
      } else if (phone && !user.phone) {
        user = await prisma.user.update({ where: { id: user.id }, data: { phone } });
      }
      finalUserId = user.id;
    }
    await prisma.membership.upsert({
      where: { userId_tenantId: { userId: finalUserId, tenantId: tenant.id } },
      create: { userId: finalUserId, tenantId: tenant.id, role: "CLIENT" },
      update: {},
    });

    if (await userHasOpenDebt(finalUserId, tenant.id)) {
      return NextResponse.json(
        { error: "Tienes un saldo pendiente con el estudio. Contacta a administración." },
        { status: 403 },
      );
    }
    const existingBooking = await prisma.booking.findFirst({
      where: { classId, tenantId: tenant.id, userId: finalUserId, status: "CONFIRMED" },
    });
    if (existingBooking) {
      return NextResponse.json({ error: "Ya tienes una reserva para esta clase" }, { status: 409 });
    }

    // Reuse an incomplete/canceled subscription row; reject an active one.
    const existingSub = await prisma.memberSubscription.findUnique({
      where: { tenantId_userId_packageId: { tenantId: tenant.id, userId: finalUserId, packageId } },
    });
    if (existingSub && !["canceled", "incomplete"].includes(existingSub.status)) {
      return NextResponse.json(
        { error: "Ya tienes una suscripción activa para este plan." },
        { status: 409 },
      );
    }
    if (existingSub) {
      await prisma.memberSubscription.delete({ where: { id: existingSub.id } });
    }

    const shareRefCode = await getShareCookieCode();
    const subscription = await createMemberSubscription({
      tenantId: tenant.id,
      userId: finalUserId,
      packageId,
      shareRefCode,
    });

    // Charged synchronously → the sale is real now; async/3DS cases convert
    // in the webhook via the stashed shareRefCode.
    if (subscription.status === "active") {
      await attributeShareConversion({
        tenantId: tenant.id,
        code: shareRefCode,
        kind: "purchase",
        amount: pkg.price,
        refType: "subscription",
        refId: subscription.id,
        buyerUserId: finalUserId,
      });
    }

    if (subscription.status === "active") {
      return NextResponse.json({ status: "active", subscriptionId: subscription.id });
    }

    const invoice = subscription.latest_invoice as unknown as Record<string, unknown> | null;
    const confirmationSecret = invoice?.confirmation_secret as Record<string, unknown> | null;
    const clientSecret = (confirmationSecret?.client_secret as string | null) ?? null;
    if (clientSecret) {
      return NextResponse.json({
        status: "requires_payment",
        clientSecret,
        stripeAccountId: tenant.stripeAccountId,
        subscriptionId: subscription.id,
        amount: pkg.price,
        currency: pkg.currency,
      });
    }

    return NextResponse.json({ status: subscription.status, subscriptionId: subscription.id });
  } catch (error) {
    console.error("POST /api/book-and-subscribe error:", error);
    return NextResponse.json({ error: "Error al iniciar la suscripción" }, { status: 500 });
  }
}
