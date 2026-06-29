import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireAuth } from "@/lib/tenant";
import { isApplePassConfigured } from "@/lib/wallet/config";
import { buildMembershipPass } from "@/lib/wallet/build-pass";

// passkit-generator + sharp need the Node runtime (native crypto/image).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Base URL Apple's servers call back to for pass updates (same deployment). */
async function webServiceBaseUrl(): Promise<string | undefined> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return undefined;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}/api/wallet/apple-pass/v1`;
}

/**
 * Serves the signed `.pkpass` for the logged-in member's Apple Wallet
 * membership card. Gated server-side on an active subscription — the client
 * button visibility is a convenience, this is the real check.
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
      return NextResponse.json({ error: "no_active_membership" }, { status: 403 });
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
