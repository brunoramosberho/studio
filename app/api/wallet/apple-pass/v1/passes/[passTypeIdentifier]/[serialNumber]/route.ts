import { NextRequest, NextResponse } from "next/server";
import { verifyApplePassAuthToken } from "@/lib/wallet/config";
import { resolvePassSerial } from "@/lib/wallet/serial";
import { buildMembershipPass } from "@/lib/wallet/build-pass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ passTypeIdentifier: string; serialNumber: string }>;

/** Returns the latest signed `.pkpass` for a pass (Apple fetches this on update). */
export async function GET(req: NextRequest, ctx: { params: Params }) {
  const { serialNumber } = await ctx.params;

  const token = (req.headers.get("authorization") ?? "").replace(/^ApplePass\s+/i, "");
  if (!token || !verifyApplePassAuthToken(serialNumber, token)) {
    return new NextResponse(null, { status: 401 });
  }

  const resolved = await resolvePassSerial(serialNumber);
  if (!resolved) return new NextResponse(null, { status: 404 });

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  // Wallet appends /v1/... itself — the base URL must not include it.
  const webServiceURL = host ? `${proto}://${host}/api/wallet/apple-pass` : undefined;

  const result = await buildMembershipPass({
    tenantId: resolved.tenantId,
    userId: resolved.userId,
    webServiceURL,
  });
  if (!result) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Last-Modified": new Date().toUTCString(),
    },
  });
}
