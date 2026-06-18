// Shopify Storefront API client.
//
// Read-only: we mirror a tenant's Shopify catalog into the public shop / PWA
// and redirect clicks to the Shopify storefront. There is no checkout or
// write-back here — only the public Storefront API (a read-only token).
//
// Docs: https://shopify.dev/docs/api/storefront

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";

// Shape consumed by /api/shop and the public shop UI. Mirrors the native
// category/product shape so the front-end is source-agnostic.
export interface ShopifyShopProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  externalUrl: string | null;
}

export interface ShopifyShopCategory {
  id: string;
  name: string;
  products: ShopifyShopProduct[];
}

/**
 * Normalise whatever the studio pasted into a bare myshopify-style host:
 * strips scheme, path, query and trailing slash. "https://x.myshopify.com/" →
 * "x.myshopify.com".
 */
export function normalizeShopDomain(input: string): string {
  let v = (input || "").trim().toLowerCase();
  v = v.replace(/^https?:\/\//, "");
  v = v.replace(/\/.*$/, "");
  return v;
}

function endpoint(shopDomain: string): string {
  return `https://${shopDomain}/api/${API_VERSION}/graphql.json`;
}

interface StorefrontGraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function storefrontQuery<T>(
  shopDomain: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(endpoint(shopDomain), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    // Always read the live catalog so price/availability changes show up
    // without a deploy or cron.
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Token de Storefront inválido o sin permisos.");
  }
  if (res.status === 404) {
    throw new Error("Dominio de Shopify no encontrado.");
  }
  if (!res.ok) {
    throw new Error(`Shopify respondió ${res.status}.`);
  }

  const json = (await res.json()) as StorefrontGraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Respuesta vacía de Shopify.");
  }
  return json.data;
}

interface VariantNode {
  id: string;
  title: string;
  availableForSale: boolean;
  image: { url: string } | null;
  price: { amount: string; currencyCode: string };
  selectedOptions: { name: string; value: string }[];
}

interface ProductNode {
  id: string;
  title: string;
  description: string | null;
  productType: string | null;
  handle: string;
  onlineStoreUrl: string | null;
  featuredImage: { url: string } | null;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  options: { name: string; values: string[] }[];
  variants: { nodes: VariantNode[] };
}

const PRODUCTS_QUERY = /* GraphQL */ `
  query ShopProducts($first: Int!) {
    products(first: $first, sortKey: TITLE) {
      edges {
        node {
          id
          title
          description(truncateAt: 280)
          productType
          handle
          onlineStoreUrl
          featuredImage { url }
          priceRange { minVariantPrice { amount currencyCode } }
          options { name values }
          variants(first: 100) {
            nodes {
              id
              title
              availableForSale
              image { url }
              price { amount currencyCode }
              selectedOptions { name value }
            }
          }
        }
      }
    }
  }
`;

// "Color" / "Colour" / "Color" (es) — the option we flatten into one card each.
const COLOR_OPTION = /^colou?r$/i;

function variantNumericId(gid: string): string {
  const m = gid.match(/(\d+)$/);
  return m ? m[1] : "";
}

function productUrl(shopDomain: string, n: ProductNode): string {
  // onlineStoreUrl is null when the product isn't published to the Online
  // Store channel; fall back to the canonical product path.
  return n.onlineStoreUrl ?? `https://${shopDomain}/products/${n.handle}`;
}

/**
 * Turn one Shopify product into one card per **color** (so the PWA grid shows
 * each colorway separately, deep-linked to that variant on Shopify). Products
 * without a color option — or with a single color — collapse to one card.
 * Size/other options aren't exploded; the buyer picks those on Shopify.
 */
function expandProduct(shopDomain: string, n: ProductNode): ShopifyShopProduct[] {
  const base = productUrl(shopDomain, n);
  const single = (): ShopifyShopProduct => ({
    id: n.id,
    name: n.title,
    description: n.description?.trim() || null,
    price: Number(n.priceRange.minVariantPrice.amount) || 0,
    currency: n.priceRange.minVariantPrice.currencyCode,
    imageUrl: n.featuredImage?.url ?? null,
    externalUrl: base,
  });

  const colorOpt = n.options?.find((o) => COLOR_OPTION.test(o.name.trim()));
  if (!colorOpt || colorOpt.values.length <= 1) return [single()];

  const cards: ShopifyShopProduct[] = [];
  for (const color of colorOpt.values) {
    const matching = n.variants.nodes.filter((v) =>
      v.selectedOptions.some(
        (so) => so.name === colorOpt.name && so.value === color,
      ),
    );
    if (matching.length === 0) continue;
    // Prefer an in-stock variant for the price/image shown on the card.
    const rep = matching.find((v) => v.availableForSale) ?? matching[0];
    const vid = variantNumericId(rep.id);
    cards.push({
      id: rep.id,
      name: `${n.title} · ${color}`,
      description: n.description?.trim() || null,
      price: Number(rep.price.amount) || 0,
      currency: rep.price.currencyCode,
      imageUrl: rep.image?.url ?? n.featuredImage?.url ?? null,
      externalUrl: vid ? `${base}?variant=${vid}` : base,
    });
  }
  return cards.length ? cards : [single()];
}

/**
 * Fetch the tenant's Shopify catalog grouped into categories (by Shopify
 * "product type", with a single fallback bucket for products that have none).
 */
export async function fetchShopifyCatalog(
  shopDomain: string,
  token: string,
): Promise<ShopifyShopCategory[]> {
  const data = await storefrontQuery<{
    products: { edges: { node: ProductNode }[] };
  }>(shopDomain, token, PRODUCTS_QUERY, { first: 100 });

  const buckets = new Map<string, ShopifyShopCategory>();
  for (const { node } of data.products.edges) {
    const type = node.productType?.trim() || "";
    const key = type || "__all__";
    let cat = buckets.get(key);
    if (!cat) {
      cat = { id: `shopify:${key}`, name: type || "Tienda", products: [] };
      buckets.set(key, cat);
    }
    cat.products.push(...expandProduct(shopDomain, node));
  }

  return Array.from(buckets.values()).filter((c) => c.products.length > 0);
}

/**
 * Verify credentials by reading the shop name. Returns the shop name on
 * success; throws a human-readable error otherwise.
 */
export async function testShopifyConnection(
  shopDomain: string,
  token: string,
): Promise<string> {
  const data = await storefrontQuery<{ shop: { name: string } }>(
    shopDomain,
    token,
    /* GraphQL */ `query { shop { name } }`,
  );
  return data.shop.name;
}
