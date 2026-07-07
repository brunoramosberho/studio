import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireAuth } from "@/lib/tenant";
import { isApplePassConfigured } from "@/lib/wallet/config";
import { buildMembershipPass } from "@/lib/wallet/build-pass";

// passkit-generator + sharp need the Node runtime (native crypto/image).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Base URL Apple's devices call back to for pass updates (same deployment).
 * IMPORTANT: Wallet appends `/v1/devices/...` to this itself, so the base must
 * NOT include `/v1` — including it broke registration (`/v1/v1/...` → 404) and
 * no pass ever received updates.
 */
async function webServiceBaseUrl(): Promise<string | undefined> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return undefined;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}/api/wallet/apple-pass`;
}

/**
 * Serves the signed `.pkpass` for the logged-in member's Apple Wallet
 * membership card. Available to every client — the card shows their current
 * plan (or plain "Miembro"); any benefit is validated live at scan time.
 */
export async function GET() {
  if (!isApplePassConfigured()) {
    return NextResponse.json({ error: "wallet_not_configured" }, { status: 503 });
  }

  let auth: Awaited<ReturnType<typeof requireAuth>>;
  try {
    auth = await requireAuth();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { session, tenant } = auth;

  try {
    const result = await buildMembershipPass({
      tenantId: tenant.id,
      userId: session.user.id,
      webServiceURL: await webServiceBaseUrl(),
    });
    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${tenant.slug}-membership.pkpass"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/wallet/apple-pass error:", err);
    return NextResponse.json({ error: "pass_generation_failed" }, { status: 500 });
  }
}
