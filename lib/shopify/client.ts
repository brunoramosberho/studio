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

interface ProductNode {
  id: string;
  title: string;
  description: string | null;
  productType: string | null;
  handle: string;
  onlineStoreUrl: string | null;
  featuredImage: { url: string } | null;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
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
        }
      }
    }
  }
`;

function mapProduct(shopDomain: string, n: ProductNode): ShopifyShopProduct {
  return {
    id: n.id,
    name: n.title,
    description: n.description?.trim() || null,
    price: Number(n.priceRange.minVariantPrice.amount) || 0,
    currency: n.priceRange.minVariantPrice.currencyCode,
    imageUrl: n.featuredImage?.url ?? null,
    // onlineStoreUrl is null when the product isn't published to the Online
    // Store channel; fall back to the canonical product path.
    externalUrl: n.onlineStoreUrl ?? `https://${shopDomain}/products/${n.handle}`,
  };
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
    cat.products.push(mapProduct(shopDomain, node));
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
