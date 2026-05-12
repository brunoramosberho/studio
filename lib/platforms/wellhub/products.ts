// Wellhub "Products" — the activity catalog (Yoga, Swimming, Virtual…).
// Required to set `product_id` on every Class/Slot we push. We cache the list
// locally in `WellhubProduct` so admin UIs can populate dropdowns without
// hitting Wellhub on every render.

import { prisma } from "@/lib/db";
import { bookingApi } from "./client";
import type { WellhubProductsResponse } from "./types";

/** GET /setup/v1/gyms/:gym_id/products */
export async function fetchWellhubProducts(gymId: number): Promise<WellhubProductsResponse> {
  return bookingApi<WellhubProductsResponse>(`/setup/v1/gyms/${gymId}/products`);
}

/**
 * Pulls the product catalog for a gym and upserts it into `WellhubProduct`.
 * Idempotent — safe to run on a schedule. Returns the count of products synced.
 */
export async function refreshWellhubProducts(opts: {
  tenantId: string;
  gymId: number;
}): Promise<{ count: number }> {
  const res = await fetchWellhubProducts(opts.gymId);

  await prisma.$transaction(
    res.products.map((p) =>
      prisma.wellhubProduct.upsert({
        where: { tenantId_productId: { tenantId: opts.tenantId, productId: p.product_id } },
        create: {
          tenantId: opts.tenantId,
          gymId: opts.gymId,
          productId: p.product_id,
          name: p.name,
          virtual: p.virtual,
          updatedAt: new Date(p.updated_at),
        },
        update: {
          gymId: opts.gymId,
          name: p.name,
          virtual: p.virtual,
          updatedAt: new Date(p.updated_at),
        },
      }),
    ),
  );

  return { count: res.products.length };
}
