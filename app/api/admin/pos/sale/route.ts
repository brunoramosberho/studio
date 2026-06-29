import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, getTenantCurrency } from "@/lib/tenant";
import { createMemberPayment } from "@/lib/stripe/payments";
import {
  findPackageForClass,
  deductCredit,
  createCreditUsagesForPackage,
  userPackageIncludeForBooking,
  ensureSubscriptionUserPackages,
} from "@/lib/credits";
import { sendPosReceiptEmail, getTenantBaseUrl } from "@/lib/email";
import { recognizeBookingSafe } from "@/lib/revenue/hooks";
import { notifyAdminsOfNewBooking } from "@/lib/booking-notifications";
import {
  createPosOrder,
  decrementInventoryAtLocation,
  fulfillPosOrder,
} from "@/lib/shopify/admin";
import { getAdminConnection } from "@/lib/shopify/admin-token";
import { Prisma } from "@prisma/client";

interface CartItem {
  type: "package" | "product";
  referenceId: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  // Present for Shopify-sourced products: the variant GID. Triggers creation of
  // an order in Shopify so the physical-store location's inventory decrements.
  shopifyVariantId?: string;
  metadata?: Record<string, unknown>;
}

interface SelectedClassInfo {
  classId: string;
  classTypeId: string;
  classTypeName: string;
  label: string;
  startsAt: string;
  hasCredits: boolean;
  packageId?: string;
  spotNumber?: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const tenantId = ctx.tenant.id;
    const adminUserId = ctx.session.user.id;

    const body = await request.json();
    const {
      customerId,
      items,
      selectedClass,
      paymentMethod,
      paymentMethodId,
      notes,
    }: {
      customerId: string;
      items: CartItem[];
      selectedClass?: SelectedClassInfo;
      paymentMethod: "saved_card" | "terminal" | "cash";
      paymentMethodId?: string;
      notes?: string;
    } = body;

    if (!customerId || (!items?.length && !selectedClass)) {
      return NextResponse.json(
        { error: "customerId and items or selectedClass are required" },
        { status: 400 },
      );
    }

    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, email: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    const results: {
      type: string;
      name: string;
      amount: number;
      status: string;
    }[] = [];

    const paidItems = (items ?? []).filter((i) => i.price > 0);
    const totalAmount = paidItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const tenantCurrency = await getTenantCurrency();
    const currency = items?.[0]?.currency ?? tenantCurrency.code;

    // 1. Process class reservation if customer already has credits
    if (selectedClass?.hasCredits) {
      const classData = await prisma.class.findUnique({
        where: { id: selectedClass.classId, tenantId },
        include: { classType: true },
      });

      if (classData) {
        await ensureSubscriptionUserPackages(customerId, tenantId);
        const userPackages = await prisma.userPackage.findMany({
          where: {
            userId: customerId,
            tenantId,
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
          },
          include: userPackageIncludeForBooking,
          orderBy: { expiresAt: "asc" },
        });

        const userPackage = findPackageForClass(
          userPackages,
          classData.classTypeId,
          selectedClass.packageId,
          classData.startsAt,
        );

        if (userPackage) {
          await deductCredit(userPackage.id, classData.classTypeId);

          const booking = await prisma.booking.create({
            data: {
              tenantId,
              classId: classData.id,
              userId: customerId,
              status: "CONFIRMED",
              packageUsed: userPackage.id,
              privacy: "PUBLIC",
              spotNumber: selectedClass.spotNumber ?? null,
            },
          });

          await recognizeBookingSafe({
            userPackageId: userPackage.id,
            bookingId: booking.id,
            classId: classData.id,
            scheduledAt: classData.startsAt,
            scope: "pos.existing-credits",
          });

          notifyAdminsOfNewBooking({
            tenantId,
            classId: classData.id,
            memberId: customerId,
            baseUrl: request.nextUrl.origin,
          }).catch((err) =>
            console.error("Admin booking notification failed:", err),
          );

          results.push({
            type: "class",
            name: selectedClass.label,
            amount: 0,
            status: "reserved",
          });
        }
      }
    }

    // 2. Process Stripe charge (saved_card only)
    let stripePaymentIntentId: string | null = null;

    if (totalAmount > 0 && paymentMethod === "saved_card") {
      if (!paymentMethodId) {
        return NextResponse.json(
          { error: "paymentMethodId is required for saved_card payment" },
          { status: 400 },
        );
      }

      const paymentIntent = await createMemberPayment({
        tenantId,
        memberId: customerId,
        amountInCurrency: totalAmount,
        type: "pos",
        description: `POS: ${paidItems.map((i) => i.name).join(", ")}`,
        paymentMethodId,
        concept: paidItems.map((i) => i.name).join(", "),
      });

      stripePaymentIntentId = paymentIntent.id;

      if (paymentIntent.status !== "succeeded") {
        return NextResponse.json({
          success: true,
          requiresConfirmation: true,
          clientSecret: paymentIntent.client_secret,
          stripeAccountId: ctx.tenant.stripeAccountId,
          total: totalAmount,
          currency,
        });
      }
    }

    // 3. Fulfill package purchases and track created userPackage IDs
    const packageRefMap = new Map<string, string>();

    for (const item of paidItems) {
      if (item.type === "package") {
        const pkg = await prisma.package.findUnique({
          where: { id: item.referenceId },
          include: { creditAllocations: true },
        });

        if (pkg) {
          const purchasedAt = new Date();
          const expiresAt = new Date(purchasedAt);
          expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

          const hasAllocations = pkg.creditAllocations.length > 0;

          const userPackage = await prisma.userPackage.create({
            data: {
              userId: customerId,
              packageId: pkg.id,
              tenantId,
              creditsTotal: hasAllocations ? null : pkg.credits,
              creditsUsed: 0,
              expiresAt,
              stripePaymentId:
                paymentMethod === "saved_card"
                  ? "pending_stripe"
                  : `pos_${paymentMethod}_${Date.now()}`,
              purchasedAt,
            },
          });

          if (hasAllocations) {
            await createCreditUsagesForPackage(userPackage.id, pkg.id);
          }

          packageRefMap.set(item.referenceId, userPackage.id);

          results.push({
            type: "package",
            name: item.name,
            amount: item.price,
            status: "purchased",
          });
        }
      }

      if (item.type === "product") {
        results.push({
          type: "product",
          name: item.name,
          amount: item.price * item.quantity,
          status: "sold",
        });
      }
    }

    // 4. Book the class after package purchase (no credits before, now has them)
    if (selectedClass && !selectedClass.hasCredits && paidItems.some((i) => i.type === "package")) {
      const clsData = await prisma.class.findUnique({
        where: { id: selectedClass.classId, tenantId },
        include: { classType: true },
      });

      if (clsData) {
        const refreshedPackages = await prisma.userPackage.findMany({
          where: {
            userId: customerId,
            tenantId,
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
          },
          include: userPackageIncludeForBooking,
          orderBy: { expiresAt: "asc" },
        });

        const matchPkg = findPackageForClass(
          refreshedPackages,
          clsData.classTypeId,
          undefined,
          clsData.startsAt,
        );

        if (matchPkg) {
          await deductCredit(matchPkg.id, clsData.classTypeId);

          const booking = await prisma.booking.create({
            data: {
              tenantId,
              classId: clsData.id,
              userId: customerId,
              status: "CONFIRMED",
              packageUsed: matchPkg.id,
              privacy: "PUBLIC",
              spotNumber: selectedClass?.spotNumber ?? null,
            },
          });

          await recognizeBookingSafe({
            userPackageId: matchPkg.id,
            bookingId: booking.id,
            classId: clsData.id,
            scheduledAt: clsData.startsAt,
            scope: "pos.post-purchase",
          });

          notifyAdminsOfNewBooking({
            tenantId,
            classId: clsData.id,
            memberId: customerId,
            baseUrl: request.nextUrl.origin,
          }).catch((err) =>
            console.error("Admin booking notification failed:", err),
          );

          results.push({
            type: "class",
            name: selectedClass.label,
            amount: 0,
            status: "reserved",
          });
        }
      }
    }

    // 4.5. Create the order in Shopify for physical-store products so its
    // inventory decrements and the sale shows up in Shopify's reports. The POS
    // already collected payment, so a Shopify failure must NOT roll back the
    // sale — we log it, tag the transactions, and surface a flag to reconcile.
    let shopifyOrder: { id: number; name: string } | null = null;
    let shopifyOrderError: string | null = null;
    const shopifyItems = paidItems.filter(
      (i) => i.type === "product" && i.shopifyVariantId,
    );
    if (shopifyItems.length > 0) {
      const config = await prisma.shopifyConfig.findUnique({
        where: { tenantId },
        select: { posLocationId: true },
      });
      if (config?.posLocationId) {
        try {
          const conn = await getAdminConnection(tenantId);
          if (conn) {
            const lineItems = shopifyItems.map((i) => ({
              variantId: i.shopifyVariantId as string,
              quantity: i.quantity,
            }));
            shopifyOrder = await createPosOrder(conn.shopDomain, conn.token, {
              locationId: config.posLocationId,
              lineItems,
              email: customer.email,
            });
            // The order doesn't move inventory — decrement the chosen physical
            // location's stock explicitly.
            await decrementInventoryAtLocation(
              conn.shopDomain,
              conn.token,
              config.posLocationId,
              lineItems,
            );
            // Mark the order fulfilled (item handed over in person). Best-effort:
            // the sale + inventory are already done, so a fulfillment hiccup must
            // not fail the sale.
            try {
              await fulfillPosOrder(
                conn.shopDomain,
                conn.token,
                shopifyOrder.id,
              );
            } catch (ferr) {
              console.error(
                "[pos-sale] Shopify fulfillment failed (order + inventory ok)",
                ferr,
              );
            }
          }
        } catch (err) {
          shopifyOrderError =
            err instanceof Error ? err.message : "Shopify order failed";
          console.error("[pos-sale] Shopify order creation failed", err);
        }
      }
    }

    // 5. Create one PosTransaction per paid item (all payment methods)
    const dbPaymentMethod =
      paymentMethod === "terminal" ? "card" : paymentMethod;

    for (const item of paidItems) {
      const refId =
        item.type === "package"
          ? packageRefMap.get(item.referenceId)
          : item.type === "product"
            ? item.referenceId
            : undefined;

      const itemMetadata: Record<string, string | number> = {};
      if (stripePaymentIntentId)
        itemMetadata.stripePaymentIntentId = stripePaymentIntentId;
      if (item.type === "product" && item.shopifyVariantId) {
        itemMetadata.shopifyVariantId = item.shopifyVariantId;
        if (shopifyOrder) {
          itemMetadata.shopifyOrderId = shopifyOrder.id;
          itemMetadata.shopifyOrderName = shopifyOrder.name;
        }
        if (shopifyOrderError) itemMetadata.shopifyOrderError = shopifyOrderError;
      }

      const tx = await prisma.posTransaction.create({
        data: {
          tenantId,
          memberId: customerId,
          amount: item.price * item.quantity,
          currency: currency.toLowerCase(),
          paymentMethod: dbPaymentMethod,
          type: mapItemType(item.type),
          concept: item.name,
          conceptSub: notes ?? null,
          status: "completed",
          processedById: adminUserId,
          referenceId: refId,
          ...(Object.keys(itemMetadata).length > 0 && {
            metadata: itemMetadata as Prisma.InputJsonObject,
          }),
        },
      });

      // Fire-and-forget commission accrual. Idempotent — replays are safe.
      try {
        const { onPosTransactionCompleted } = await import("@/lib/staff");
        await onPosTransactionCompleted(tx.id);
      } catch (err) {
        console.error("[pos-sale] commission accrual failed", tx.id, err);
      }
    }

    // Update lifecycle
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: customerId, tenantId } },
    });

    if (membership && !membership.firstPurchaseAt) {
      await prisma.membership.update({
        where: {
          userId_tenantId: { userId: customerId, tenantId },
        },
        data: { firstPurchaseAt: new Date() },
      });
    }

    // Send receipt email (only for paid items)
    if (totalAmount > 0) {
      try {
        const baseUrl = getTenantBaseUrl(ctx.tenant.slug);
        await sendPosReceiptEmail({
          to: customer.email,
          customerName: customer.name ?? "Cliente",
          items: (items ?? []).map((i) => ({
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            currency: i.currency,
          })),
          total: totalAmount,
          currency,
          paymentMethod,
          studioUrl: baseUrl,
        });
      } catch (emailErr) {
        console.error("Failed to send POS receipt email:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      saleId: `pos_${Date.now()}`,
      total: totalAmount,
      currency,
      results,
      customerName: customer.name,
      ...(shopifyOrder && { shopifyOrderName: shopifyOrder.name }),
      ...(shopifyOrderError && { shopifyOrderError }),
    });
  } catch (error) {
    console.error("POST /api/admin/pos/sale error:", error);
    return NextResponse.json(
      { error: "Error al procesar la venta" },
      { status: 500 },
    );
  }
}

function mapItemType(type: string): string {
  switch (type) {
    case "product":
      return "product";
    default:
      return "package";
  }
}
