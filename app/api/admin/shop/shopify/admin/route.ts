import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { encrypt, decrypt } from "@/lib/encryption";
import { exchangeClientCredentials, listLocations } from "@/lib/shopify/admin";
import { clearAdminTokenCache } from "@/lib/shopify/admin-token";
import { normalizeShopDomain } from "@/lib/shopify/client";

function errorResponse(e: unknown) {
  const msg = e instanceof Error ? e.message : "Error";
  const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
  return NextResponse.json({ error: msg }, { status });
}

const REQUIRED_SCOPES = [
  "read_products",
  "read_inventory",
  "write_inventory",
  "read_locations",
  "write_orders",
];

// Configure the Admin API side of the Shopify connection: the Dev Dashboard
// app's Client ID + Secret used by the POS (via the client-credentials grant)
// to read per-location inventory and create orders, plus the physical-store
// location whose stock the POS uses.
//
// Requires the Storefront connection (shopDomain) to exist first.
export async function PUT(request: NextRequest) {
  try {
    const ctx = await requirePermission("shop");
    const body = await request.json();

    const existing = await prisma.shopifyConfig.findUnique({
      where: { tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Conecta primero la tienda Shopify (dominio + token de Storefront).",
        },
        { status: 400 },
      );
    }

    // Client ID — empty means "keep the current one".
    const clientId =
      typeof body.adminClientId === "string" && body.adminClientId.trim()
        ? body.adminClientId.trim()
        : existing.adminClientId;

    // Client Secret — empty means "keep the current one".
    const rawSecret =
      typeof body.adminClientSecret === "string"
        ? body.adminClientSecret.trim()
        : "";
    let clientSecret = rawSecret;
    if (!clientSecret && existing.adminClientSecret) {
      clientSecret = decrypt(existing.adminClientSecret);
    }

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Client ID y Client Secret requeridos" },
        { status: 400 },
      );
    }

    // The myshopify domain for Admin calls. Empty means "keep the current one";
    // falls back to the Storefront shopDomain if never set.
    const rawDomain =
      typeof body.adminShopDomain === "string"
        ? normalizeShopDomain(body.adminShopDomain)
        : "";
    const adminDomain =
      rawDomain || existing.adminShopDomain || existing.shopDomain;

    // Validate by exchanging for a token (also proves the app is installed).
    let token: string;
    let scope: string;
    try {
      const result = await exchangeClientCredentials(
        adminDomain,
        clientId,
        clientSecret,
      );
      token = result.accessToken;
      scope = result.scope;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo conectar";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Surface missing scopes early so the studio fixes the app config.
    // Shopify returns scopes comma-separated (e.g. "read_products,read_inventory");
    // split on commas and/or whitespace to be safe. A granted write_X scope also
    // satisfies a required read_X (Shopify collapses read_X when write_X is set).
    const granted = new Set(scope.split(/[\s,]+/).filter(Boolean));
    const satisfied = (s: string) =>
      granted.has(s) ||
      (s.startsWith("read_") && granted.has(`write_${s.slice(5)}`));
    const missing = REQUIRED_SCOPES.filter((s) => !satisfied(s));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `A la app le faltan permisos en Shopify: ${missing.join(", ")}. Agrégalos en la app y vuelve a intentar.`,
        },
        { status: 400 },
      );
    }

    // Resolve the chosen location's name (and validate it belongs to the shop).
    let posLocationId: string | null = existing.posLocationId;
    let posLocationName: string | null = existing.posLocationName;
    if (typeof body.posLocationId === "string" && body.posLocationId) {
      const locations = await listLocations(adminDomain, token);
      const match = locations.find((l) => l.id === body.posLocationId);
      if (!match) {
        return NextResponse.json(
          { error: "Ubicación no encontrada en la tienda." },
          { status: 400 },
        );
      }
      posLocationId = match.id;
      posLocationName = match.name;
    }

    await prisma.shopifyConfig.update({
      where: { tenantId: ctx.tenant.id },
      data: {
        adminClientId: clientId,
        adminClientSecret: encrypt(clientSecret),
        adminShopDomain: adminDomain,
        posLocationId,
        posLocationName,
      },
    });
    await clearAdminTokenCache(ctx.tenant.id);

    return NextResponse.json({
      adminConnected: true,
      adminShopDomain: adminDomain,
      posLocationId,
      posLocationName,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// Disconnect the Admin API side only (keeps the Storefront catalog connection).
export async function DELETE() {
  try {
    const ctx = await requirePermission("shop");
    // Clear the cached token first, while the domains are still on record.
    await clearAdminTokenCache(ctx.tenant.id);
    await prisma.shopifyConfig.updateMany({
      where: { tenantId: ctx.tenant.id },
      data: {
        adminClientId: null,
        adminClientSecret: null,
        adminAccessToken: null,
        adminShopDomain: null,
        posLocationId: null,
        posLocationName: null,
      },
    });
    return NextResponse.json({ adminConnected: false });
  } catch (e) {
    return errorResponse(e);
  }
}
