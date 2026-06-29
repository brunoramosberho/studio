// Shopify Admin API client.
//
// Unlike lib/shopify/client.ts (the public, read-only Storefront API used to
// mirror the catalog into the customer-facing shop), this client talks to the
// Admin API with an app access token. It can read per-location inventory and
// create orders — which the Storefront API cannot do.
//
// Used by the in-studio POS: read the "physical store" location's stock and,
// on checkout, create an order in Shopify so that location's inventory is
// decremented and the sale shows up in Shopify's reports.
//
// Auth: Shopify Dev Dashboard apps use the client-credentials grant — we
// exchange the app's Client ID + Client Secret for a short-lived (24h) Admin
// API token (see exchangeClientCredentials + lib/shopify/admin-token.ts). The
// app must be installed on the shop and have scopes: read_products,
// read_inventory, read_locations, write_orders, read_orders.
//
// Reads use GraphQL. Order creation uses the REST endpoint because it accepts
// an explicit `location_id` to decrement the right location's inventory.
//
// Docs: https://shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";

interface ClientCredentialsToken {
  accessToken: string;
  /** Seconds until expiry (Shopify returns 86399 ≈ 24h). */
  expiresIn: number;
  /** Space-separated scopes actually granted to the token. */
  scope: string;
}

/**
 * Exchange a Dev Dashboard app's Client ID + Secret for a short-lived Admin API
 * access token (client-credentials grant). The app must be installed on the
 * shop. Throws a human-readable error on failure.
 */
export async function exchangeClientCredentials(
  shopDomain: string,
  clientId: string,
  clientSecret: string,
): Promise<ClientCredentialsToken> {
  const res = await fetch(
    `https://${shopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
    },
  );

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Client ID o Client Secret inválidos, o la app no está instalada en esta tienda.",
    );
  }
  if (res.status === 404) {
    throw new Error(
      "Dominio de Shopify no encontrado (usa el dominio .myshopify.com de la tienda).",
    );
  }

  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error_description?: string;
    error?: string;
  } | null;

  if (!res.ok || !json?.access_token) {
    const detail =
      json?.error_description || json?.error || `HTTP ${res.status}`;
    throw new Error(`Shopify rechazó las credenciales: ${detail}`);
  }

  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 86399,
    scope: json.scope ?? "",
  };
}

function graphqlEndpoint(shopDomain: string): string {
  return `https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`;
}

function restEndpoint(shopDomain: string, path: string): string {
  return `https://${shopDomain}/admin/api/${API_VERSION}/${path}`;
}

interface AdminGraphQLResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
}

async function adminQuery<T>(
  shopDomain: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(graphqlEndpoint(shopDomain), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (res.status === 401) {
    throw new Error("Token de Admin API inválido.");
  }
  if (res.status === 403) {
    throw new Error(
      "Token de Admin API sin permisos suficientes (revisa los scopes: read_products, read_inventory, read_locations, write_orders).",
    );
  }
  if (res.status === 404) {
    throw new Error("Dominio de Shopify no encontrado.");
  }
  if (!res.ok) {
    throw new Error(`Shopify Admin respondió ${res.status}.`);
  }

  const json = (await res.json()) as AdminGraphQLResponse<T>;
  if (json.errors?.length) {
    const access = json.errors.find(
      (e) => e.extensions?.code === "ACCESS_DENIED",
    );
    if (access) {
      throw new Error(
        "El token de Admin API no tiene los scopes necesarios (read_products, read_inventory, read_locations).",
      );
    }
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Respuesta vacía de Shopify Admin.");
  }
  return json.data;
}

/** Numeric id from a Shopify GID, e.g. "gid://shopify/Location/123" → "123". */
export function numericId(gid: string): string {
  const m = (gid || "").match(/(\d+)$/);
  return m ? m[1] : "";
}

/**
 * Validate the Admin token by reading the shop name. Returns the shop name on
 * success; throws a human-readable error otherwise.
 */
export async function testAdminConnection(
  shopDomain: string,
  token: string,
): Promise<string> {
  const data = await adminQuery<{ shop: { name: string } }>(
    shopDomain,
    token,
    /* GraphQL */ `query { shop { name } }`,
  );
  return data.shop.name;
}

export interface ShopifyLocation {
  id: string;
  name: string;
  isActive: boolean;
}

/** List the shop's locations so the admin can pick the "physical store" one. */
export async function listLocations(
  shopDomain: string,
  token: string,
): Promise<ShopifyLocation[]> {
  const data = await adminQuery<{
    locations: { nodes: { id: string; name: string; isActive: boolean }[] };
  }>(
    shopDomain,
    token,
    /* GraphQL */ `
      query Locations {
        locations(first: 50, includeInactive: false) {
          nodes { id name isActive }
        }
      }
    `,
  );
  return data.locations.nodes;
}

// ---- POS catalog (per-location inventory) ------------------------------------

export interface PosVariant {
  /** Variant GID, e.g. "gid://shopify/ProductVariant/123". */
  id: string;
  /** Variant title, e.g. "M / Negro" or "Default Title". */
  title: string;
  sku: string | null;
  price: number;
  currency: string;
  /** Per-option pairs, e.g. [{name:"Talla", value:"M"}]. */
  options: { name: string; value: string }[];
  /** Available units at the POS location. Null = inventory not tracked. */
  available: number | null;
}

export interface PosProduct {
  id: string;
  title: string;
  productType: string | null;
  imageUrl: string | null;
  variants: PosVariant[];
}

export interface PosCategory {
  id: string;
  name: string;
  products: PosProduct[];
}

interface RawVariantNode {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  selectedOptions: { name: string; value: string }[];
  inventoryItem: {
    tracked: boolean;
    inventoryLevel: {
      quantities: { name: string; quantity: number }[];
    } | null;
  } | null;
}

interface RawProductNode {
  id: string;
  title: string;
  productType: string | null;
  featuredImage: { url: string } | null;
  variants: { nodes: RawVariantNode[] };
}

const POS_CATALOG_QUERY = /* GraphQL */ `
  query PosCatalog($cursor: String, $locationId: ID!) {
    products(first: 50, after: $cursor, query: "status:active", sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        productType
        featuredImage { url }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
            selectedOptions { name value }
            inventoryItem {
              tracked
              inventoryLevel(locationId: $locationId) {
                quantities(names: ["available"]) { name quantity }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetch the active catalog with each variant's available stock **at the given
 * location**, grouped into categories by Shopify product type. Out-of-stock
 * variants are still returned (the POS warns but allows selling). Variants with
 * untracked inventory report `available: null` (unlimited).
 */
export async function fetchAdminCatalogForPos(
  shopDomain: string,
  token: string,
  locationId: string,
  currency: string,
): Promise<PosCategory[]> {
  const products: RawProductNode[] = [];
  let cursor: string | null = null;
  // Cap pagination to keep POS open snappy; a studio catalog rarely exceeds this.
  for (let page = 0; page < 10; page++) {
    const data: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: RawProductNode[];
      };
    } = await adminQuery(shopDomain, token, POS_CATALOG_QUERY, {
      cursor,
      locationId,
    });
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  const buckets = new Map<string, PosCategory>();
  for (const p of products) {
    const variants: PosVariant[] = p.variants.nodes.map((v) => {
      const tracked = v.inventoryItem?.tracked ?? false;
      const availQty =
        v.inventoryItem?.inventoryLevel?.quantities.find(
          (q) => q.name === "available",
        )?.quantity ?? null;
      return {
        id: v.id,
        title: v.title,
        sku: v.sku || null,
        price: Number(v.price) || 0,
        currency,
        options: v.selectedOptions ?? [],
        available: tracked ? (availQty ?? 0) : null,
      };
    });

    const type = p.productType?.trim() || "";
    const key = type || "__all__";
    let cat = buckets.get(key);
    if (!cat) {
      cat = { id: `shopify:${key}`, name: type || "Tienda", products: [] };
      buckets.set(key, cat);
    }
    cat.products.push({
      id: p.id,
      title: p.title,
      productType: p.productType,
      imageUrl: p.featuredImage?.url ?? null,
      variants,
    });
  }

  return Array.from(buckets.values()).filter((c) => c.products.length > 0);
}

// ---- Order creation (decrements inventory at the POS location) ----------------

export interface PosOrderLine {
  /** Variant GID or numeric id. */
  variantId: string;
  quantity: number;
}

export interface CreatedPosOrder {
  id: number;
  name: string;
}

/**
 * Create a paid order in Shopify (the sales record). Inventory is NOT touched
 * here — call decrementInventoryAtLocation separately so the decrement lands on
 * the chosen physical-store location deterministically. Uses the REST endpoint.
 *
 * Throws a human-readable error on failure; callers decide whether to surface
 * it without rolling back the already-collected POS payment.
 */
export async function createPosOrder(
  shopDomain: string,
  token: string,
  params: {
    locationId: string;
    lineItems: PosOrderLine[];
    email?: string | null;
  },
): Promise<CreatedPosOrder> {
  // Inventory is handled explicitly via decrementInventoryAtLocation (the order
  // endpoint's inventory_behaviour proved unreliable and decremented nothing),
  // so the order itself must NOT touch inventory — hence "bypass".
  const order = {
    line_items: params.lineItems.map((l) => ({
      variant_id: Number(numericId(l.variantId)),
      quantity: l.quantity,
    })),
    financial_status: "paid",
    inventory_behaviour: "bypass",
    ...(params.email ? { email: params.email } : {}),
    tags: "POS, Magic",
  };

  const res = await fetch(restEndpoint(shopDomain, "orders.json"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ order }),
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "El token de Admin API no puede crear pedidos (falta el scope write_orders).",
    );
  }

  const json = (await res.json().catch(() => null)) as {
    order?: { id: number; name: string };
    errors?: unknown;
  } | null;

  if (!res.ok || !json?.order) {
    const detail =
      json?.errors != null ? JSON.stringify(json.errors) : `HTTP ${res.status}`;
    throw new Error(`Shopify rechazó el pedido: ${detail}`);
  }

  return { id: json.order.id, name: json.order.name };
}

/**
 * Decrement each variant's "available" quantity at `locationId` by the sold
 * amount, via inventoryAdjustQuantities. This is how the POS sale actually
 * reduces the physical store's stock (the order endpoint doesn't do it
 * reliably). Resolves each variant's inventory item first, then adjusts.
 *
 * Throws a human-readable error on failure.
 */
export async function decrementInventoryAtLocation(
  shopDomain: string,
  token: string,
  locationId: string,
  items: PosOrderLine[],
): Promise<void> {
  const variantIds = [...new Set(items.map((i) => i.variantId))];

  // Resolve the inventory item id for each variant.
  const data = await adminQuery<{
    nodes: ({ id: string; inventoryItem: { id: string } | null } | null)[];
  }>(
    shopDomain,
    token,
    /* GraphQL */ `
      query VariantInventoryItems($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant { id inventoryItem { id } }
        }
      }
    `,
    { ids: variantIds },
  );

  const invItemByVariant = new Map<string, string>();
  for (const n of data.nodes) {
    if (n?.inventoryItem) invItemByVariant.set(n.id, n.inventoryItem.id);
  }

  const changes: {
    delta: number;
    inventoryItemId: string;
    locationId: string;
  }[] = [];
  for (const item of items) {
    const inventoryItemId = invItemByVariant.get(item.variantId);
    if (!inventoryItemId) continue;
    changes.push({
      delta: -Math.abs(item.quantity),
      inventoryItemId,
      locationId,
    });
  }

  if (changes.length === 0) return;

  const res = await adminQuery<{
    inventoryAdjustQuantities: {
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    shopDomain,
    token,
    /* GraphQL */ `
      mutation PosInventoryDecrement($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          userErrors { field message }
        }
      }
    `,
    { input: { reason: "correction", name: "available", changes } },
  );

  const errors = res.inventoryAdjustQuantities?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
}

/**
 * Mark a (bypass) order as fulfilled — the item was handed over in person. The
 * order claimed no inventory (inventory_behaviour=bypass), so fulfilling it does
 * NOT move stock (verified): inventory is handled by decrementInventoryAtLocation.
 * Requires the write_merchant_managed_fulfillment_orders scope.
 *
 * Throws a human-readable error on failure.
 */
export async function fulfillPosOrder(
  shopDomain: string,
  token: string,
  orderId: number,
): Promise<void> {
  const data = await adminQuery<{
    order: {
      fulfillmentOrders: { nodes: { id: string; status: string }[] };
    } | null;
  }>(
    shopDomain,
    token,
    /* GraphQL */ `
      query OrderFulfillmentOrders($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 10) { nodes { id status } }
        }
      }
    `,
    { id: `gid://shopify/Order/${orderId}` },
  );

  const openIds = (data.order?.fulfillmentOrders.nodes ?? [])
    .filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS")
    .map((f) => ({ fulfillmentOrderId: f.id }));

  if (openIds.length === 0) return;

  const res = await adminQuery<{
    fulfillmentCreate: {
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    shopDomain,
    token,
    /* GraphQL */ `
      mutation PosFulfill($f: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $f) {
          userErrors { field message }
        }
      }
    `,
    { f: { lineItemsByFulfillmentOrder: openIds } },
  );

  const errors = res.fulfillmentCreate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
}
