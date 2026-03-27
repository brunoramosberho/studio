/**
 * Tienda Be-Toro → enlaces a Shopify (https://be-toro.com/products/...).
 *
 * - Desde el seed principal: se llama `seedBeToroShop` al final.
 * - Solo shop: `npm run seed:shop` (no toca clases ni usuarios).
 */
import { PrismaClient } from "@prisma/client";

const SHOPIFY_BASE = "https://be-toro.com/products";

const leggings = [
  // Shopify slug es "sculpt" aunque el título del producto sea "Essential Leggings"
  { name: "Essential Leggings", price: 55, handle: "sculpt", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/SculptsportsbrayLegginsc-190_570501d2-f198-42af-b3a9-9f722c2d24e3.jpg?v=1773880864" },
  { name: "Flare Leggings", price: 55, handle: "flare-leggings-copia", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/FlareLeggingsNavy_StraplessTopWhite-32_2c073c35-a6a0-4149-8ebc-24c06949a444.jpg?v=1773881096" },
  { name: "The Sway Leggings", price: 55, handle: "the-sway-leggings", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/Sway_set-36_e272d352-fa31-4bf9-b69a-9ad2134e5126.jpg?v=1773879066" },
];

const tops = [
  { name: "BackOff Sportsbra", price: 40, handle: "backoff-sportsbra", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/Flare_leggins_bone_Backoff_Sportsbra_Mint-8_26bfb1ce-9b42-457c-97cb-eca4960d46c8.jpg?v=1773906556" },
  { name: "Breathe Sportsbra", price: 40, handle: "breathe-sportsbra", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/Screen_Shot_2025-12-16_at_8.07.49_PM_76a753d6-4ede-488b-bbf3-83db5109027e.png?v=1773880603" },
  { name: "Essential Sportsbra", price: 35, handle: "essential-sportsbra", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/SculptsportsbrayLegginsc-191_14cf99f9-ef4a-41e3-b2c5-ab795ea33ac4.jpg?v=1773906420" },
  { name: "Sculpt Sportsbra", price: 35, handle: "sculpt-sportsbra", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/SKU085-088_2_11cab593-ff8c-4a4d-97c2-e96ea5102e27.jpg?v=1773906459" },
  { name: "The Contour Sportsbra", price: 35, handle: "contour-sportsbra", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/FlareLeggingsBlack_ContourSportsbra-235_9cdba3b2-292e-45b4-80df-5bc28e738494.jpg?v=1773906359" },
  { name: "The Strapless Top", price: 35, handle: "the-strapless-top", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/Straplesstopblack-24_a40f2803-8263-4600-92b0-3dcf1e6d63d1.jpg?v=1773905639" },
  { name: "The Sway Sportsbra", price: 35, handle: "the-sway-sportsbra", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/Sway_set-38_394e0525-8aaa-49e3-9a65-f8c137e2b145.jpg?v=1773906399" },
];

const bodysuits = [
  { name: "Curve", price: 90, handle: "curve", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/CurveBodysuit_3fcdde30-ade2-48f5-a89b-6a9fb265ca8d.jpg?v=1773906469" },
  { name: "Flare", price: 90, handle: "flare", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/FlareBodysuitBlack-3_181c21ac-a3c9-48f4-9553-0bb0d615e089.jpg?v=1773880827" },
  { name: "Glow", price: 90, handle: "glow", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/Glow_Bodysuit_Black_0b85d5ce-3bd7-47f6-891b-be8d72e695ee.jpg?v=1773880751" },
  { name: "Halter", price: 90, handle: "halter", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/halter_911ea94b-dd0e-4201-972b-4f34cb4ed553.jpg?v=1773880793" },
  { name: "Nova", price: 75, handle: "nova", image: "https://cdn.shopify.com/s/files/1/0921/4197/7937/files/Screen_Shot_2025-12-16_at_8.52.24_PM_c606f59c-a214-46ca-a918-83211ed730e3.png?v=1773906609" },
];

export async function seedBeToroShop(db: PrismaClient, tenantId: string): Promise<number> {
  await db.product.deleteMany({ where: { tenantId } });
  await db.productCategory.deleteMany({ where: { tenantId } });

  const catLeggings = await db.productCategory.create({
    data: { name: "Leggings", position: 0, tenantId },
  });
  const catTops = await db.productCategory.create({
    data: { name: "Tops", position: 1, tenantId },
  });
  const catBodysuits = await db.productCategory.create({
    data: { name: "Bodysuits", position: 2, tenantId },
  });

  async function seedProducts(
    items: { name: string; price: number; handle: string; image: string }[],
    categoryId: string,
  ) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await db.product.create({
        data: {
          name: item.name,
          price: item.price,
          currency: "EUR",
          imageUrl: item.image,
          externalUrl: `${SHOPIFY_BASE}/${item.handle}`,
          isVisible: true,
          isActive: true,
          position: i,
          categoryId,
          tenantId,
        },
      });
    }
  }

  await seedProducts(leggings, catLeggings.id);
  await seedProducts(tops, catTops.id);
  await seedProducts(bodysuits, catBodysuits.id);

  return db.product.count({ where: { tenantId } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    let tenant = await prisma.tenant.findUnique({
      where: { slug: envSlugOrDefault() },
    });
    if (!tenant) {
      tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
    }
    if (!tenant) {
      console.error("No hay tenant en la base. Ejecuta primero el seed principal o crea un tenant.");
      process.exit(1);
    }
    const n = await seedBeToroShop(prisma, tenant.id);
    console.log(`Seeded ${n} products for Be-Toro (Shopify) in 3 categories`);
  } finally {
    await prisma.$disconnect();
  }
}

function envSlugOrDefault() {
  return process.env.SEED_TENANT_SLUG?.trim() || "betoro";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
