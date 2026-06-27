import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { listLocations } from "@/lib/shopify/admin";
import { getAdminConnection } from "@/lib/shopify/admin-token";

// List the Shopify shop's locations so the admin can pick the "physical store"
// location the POS reads inventory from. Requires the Admin app credentials.
export async function GET() {
  try {
    const ctx = await requirePermission("shop");
    const conn = await getAdminConnection(ctx.tenant.id);

    if (!conn) {
      return NextResponse.json(
        { error: "Conecta primero las credenciales de la app de Shopify." },
        { status: 400 },
      );
    }

    const locations = await listLocations(conn.shopDomain, conn.token);
    return NextResponse.json({ locations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status =
      msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
