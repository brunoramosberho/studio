import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { decrypt } from "@/lib/encryption";
import { fetchShopifyCatalog } from "@/lib/shopify/client";

export async function GET() {
  try {
    const tenant = await getTenant();
    if (!tenant) {
      return NextResponse.json([]);
    }

    // When the tenant has an active Shopify connection, the catalog is sourced
    // live from Shopify (and clicks redirect to the Shopify storefront). We
    // fall back to the native catalog on any error so the shop never goes dark.
    const shopify = await prisma.shopifyConfig.findUnique({
      where: { tenantId: tenant.id },
    });
    if (shopify?.isActive) {
      try {
        const cats = await fetchShopifyCatalog(
          shopify.shopDomain,
          decrypt(shopify.storefrontAccessToken),
        );
        if (shopify.lastError) {
          await prisma.shopifyConfig.update({
            where: { tenantId: tenant.id },
            data: { lastSyncedAt: new Date(), lastError: null },
          });
        }
        return NextResponse.json(cats);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Shopify fetch failed";
        console.error("Shopify shop fetch error:", msg);
        await prisma.shopifyConfig
          .update({ where: { tenantId: tenant.id }, data: { lastError: msg } })
          .catch(() => {});
        // fall through to native catalog
      }
    }

    const categories = await prisma.productCategory.findMany({
      where: { tenantId: tenant.id },
      orderBy: { position: "asc" },
      include: {
        products: {
          where: { isActive: true, isVisible: true },
          orderBy: [{ position: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            currency: true,
            imageUrl: true,
            externalUrl: true,
          },
        },
      },
    });

    const filtered = categories.filter((c) => c.products.length > 0);
    return NextResponse.json(filtered);
  } catch (e: unknown) {
    console.error("Shop API error:", e);
    return NextResponse.json([], { status: 200 });
  }
}
