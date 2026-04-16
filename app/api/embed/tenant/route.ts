import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";

/**
 * Public tenant metadata for the embed widget loader.
 * Returns minimal branding so the embed snippet can render spinners
 * and messaging that match the tenant even before the iframe loads.
 */
export async function GET() {
  try {
    const tenant = await getTenant();
    if (!tenant) {
      return cors({ error: "Tenant not found" }, 404);
    }
    return cors(
      {
        slug: tenant.slug,
        name: tenant.name,
        locale: tenant.locale,
        colorAccent: tenant.colorAccent,
        colorBg: tenant.colorBg,
        colorFg: tenant.colorFg,
        logoUrl: tenant.logoUrl,
      },
      200,
    );
  } catch {
    return cors({ error: "Failed to load tenant" }, 500);
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: headers() });
}

function headers() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
  };
}

function cors(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: headers() });
}
