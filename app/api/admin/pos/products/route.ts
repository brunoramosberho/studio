import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, getTenantCurrency } from "@/lib/tenant";
import { fetchAdminCatalogForPos, type PosCategory } from "@/lib/shopify/admin";
import { getAdminConnection } from "@/lib/shopify/admin-token";

// Catalog the in-studio POS sells from. Unlike the public /api/shop, this is
// admin-only and Shopify-aware:
//
//  - If the tenant has the Shopify Admin API wired up (admin token + a chosen
//    physical-store location), return that location's live catalog with each
//    variant's stock — the real sizes/inventory of the physical store.
//  - Otherwise fall back to the native Product catalog (for tenants that don't
//    use Shopify), shaped the same way so the UI is source-agnostic.
//
// Response: { source: "shopify" | "native", categories: PosCategory[] }
export async function GET() {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const tenantId = ctx.tenant.id;
    const currency = (await getTenantCurrency()).code;

    const config = await prisma.shopifyConfig.findUnique({
      where: { tenantId },
      select: { posLocationId: true },
    });
    const conn = config?.posLocationId
      ? await getAdminConnection(tenantId)
      : null;

    if (conn && config?.posLocationId) {
      try {
        const categories = await fetchAdminCatalogForPos(
          conn.shopDomain,
          conn.token,
          config.posLocationId,
          currency,
        );
        return NextResponse.json({ source: "shopify", categories });
      } catch (e) {
        // Don't leave the POS empty if Shopify hiccups — fall back to native and
        // surface the reason for debugging.
        const message = e instanceof Error ? e.message : "Shopify error";
        const categories = await nativeCatalog(tenantId);
        return NextResponse.json({
          source: "native",
          categories,
          shopifyError: message,
        });
      }
    }

    const categories = await nativeCatalog(tenantId);
    return NextResponse.json({ source: "native", categories });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status =
      msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// Native catalog shaped like the Shopify one: each product becomes a single
// "variant" (no sizes, no stock tracking) so the POS UI stays uniform.
async function nativeCatalog(tenantId: string): Promise<PosCategory[]> {
  const cats = await prisma.productCategory.findMany({
    where: { tenantId },
    orderBy: { position: "asc" },
    include: {
      products: {
        where: { isActive: true, isVisible: true },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          price: true,
          currency: true,
          imageUrl: true,
        },
      },
    },
  });

  return cats
    .filter((c) => c.products.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      products: c.products.map((p) => ({
        id: p.id,
        title: p.name,
        productType: c.name,
        imageUrl: p.imageUrl,
        variants: [
          {
            id: p.id,
            title: p.name,
            sku: null,
            price: p.price,
            currency: p.currency,
            options: [],
            available: null,
          },
        ],
      })),
    }));
}
