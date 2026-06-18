import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { encrypt, decrypt } from "@/lib/encryption";
import { normalizeShopDomain, testShopifyConnection } from "@/lib/shopify/client";

function errorResponse(e: unknown) {
  const msg = e instanceof Error ? e.message : "Error";
  const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
  return NextResponse.json({ error: msg }, { status });
}

// Status of the tenant's Shopify connection (never returns the token).
export async function GET() {
  try {
    const ctx = await requirePermission("shop");
    const config = await prisma.shopifyConfig.findUnique({
      where: { tenantId: ctx.tenant.id },
      select: {
        shopDomain: true,
        isActive: true,
        lastSyncedAt: true,
        lastError: true,
      },
    });
    return NextResponse.json({ connected: !!config, ...(config ?? {}) });
  } catch (e) {
    return errorResponse(e);
  }
}

// Connect or update the Shopify connection. Validates the credentials against
// the Storefront API before persisting; the token is stored encrypted.
export async function PUT(request: NextRequest) {
  try {
    const ctx = await requirePermission("shop");
    const body = await request.json();
    const shopDomain = normalizeShopDomain(String(body.shopDomain ?? ""));
    const rawToken =
      typeof body.storefrontAccessToken === "string"
        ? body.storefrontAccessToken.trim()
        : "";
    const isActive = body.isActive !== false;

    if (!shopDomain) {
      return NextResponse.json({ error: "Dominio requerido" }, { status: 400 });
    }

    const existing = await prisma.shopifyConfig.findUnique({
      where: { tenantId: ctx.tenant.id },
    });

    // The UI never receives the stored token, so an empty token on an existing
    // connection means "keep the current credentials".
    let token = rawToken;
    if (!token) {
      if (!existing) {
        return NextResponse.json(
          { error: "Token de Storefront requerido" },
          { status: 400 },
        );
      }
      token = decrypt(existing.storefrontAccessToken);
    }

    // Validate before saving so a studio never persists broken credentials.
    let shopName: string;
    try {
      shopName = await testShopifyConnection(shopDomain, token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo conectar";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const data = {
      shopDomain,
      storefrontAccessToken: encrypt(token),
      isActive,
      lastSyncedAt: new Date(),
      lastError: null,
    };

    await prisma.shopifyConfig.upsert({
      where: { tenantId: ctx.tenant.id },
      create: { tenantId: ctx.tenant.id, ...data },
      update: data,
    });

    return NextResponse.json({ connected: true, shopName, shopDomain, isActive });
  } catch (e) {
    return errorResponse(e);
  }
}

// Disconnect: drops the stored credentials. The public shop falls back to the
// native catalog.
export async function DELETE() {
  try {
    const ctx = await requirePermission("shop");
    await prisma.shopifyConfig.deleteMany({ where: { tenantId: ctx.tenant.id } });
    return NextResponse.json({ connected: false });
  } catch (e) {
    return errorResponse(e);
  }
}
