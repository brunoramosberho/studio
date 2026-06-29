import "server-only";
import http2 from "node:http2";
import { prisma } from "@/lib/db";
import { isApplePassConfigured } from "./config";

const APNS_HOST = "https://api.push.apple.com:443";

/** mTLS client material for APNs — the same Pass Type ID cert that signs passes. */
function loadApnsTls(): { cert: string; key: string } | null {
  const certB64 = process.env.APPLE_PASS_SIGNER_CERT_BASE64;
  const keyB64 = process.env.APPLE_PASS_SIGNER_KEY_BASE64;
  const wwdrB64 = process.env.APPLE_PASS_WWDR_BASE64;
  if (!certB64 || !keyB64) return null;
  const cert = Buffer.from(certB64, "base64").toString("utf8");
  const key = Buffer.from(keyB64, "base64").toString("utf8");
  const wwdr = wwdrB64 ? Buffer.from(wwdrB64, "base64").toString("utf8") : "";
  // Present the leaf + WWDR intermediate as the client cert chain.
  return { cert: wwdr ? `${cert}\n${wwdr}` : cert, key };
}

/**
 * Sends an empty APNs push to a pass's push token so Wallet fetches the updated
 * pass. Returns "ok", "gone" (token invalid — caller should unregister), or
 * "error". Uses cert-based mTLS over HTTP/2; no third-party library.
 */
export async function sendPassPush(pushToken: string): Promise<"ok" | "gone" | "error"> {
  const tls = loadApnsTls();
  const topic = process.env.APPLE_PASS_TYPE_ID;
  if (!tls || !topic) return "error";

  return new Promise((resolve) => {
    let settled = false;
    const done = (r: "ok" | "gone" | "error") => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    let client: http2.ClientHttp2Session;
    try {
      client = http2.connect(APNS_HOST, { cert: tls.cert, key: tls.key });
    } catch {
      return done("error");
    }
    client.on("error", () => done("error"));

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      "apns-topic": topic,
      "content-type": "application/json",
    });
    let status = 0;
    req.on("response", (h) => {
      status = Number(h[":status"]) || 0;
    });
    req.on("error", () => done("error"));
    req.on("end", () => {
      done(status === 200 ? "ok" : status === 410 ? "gone" : "error");
      try {
        client.close();
      } catch {}
    });
    req.setTimeout(10_000, () => {
      done("error");
      try {
        req.close();
        client.close();
      } catch {}
    });
    req.end(JSON.stringify({}));
  });
}

/**
 * Notifies all of a member's registered devices that their pass changed (level,
 * classes, membership…). Best effort; prunes tokens APNs reports as gone. No-op
 * when Wallet isn't configured, so it's safe to call from anywhere.
 */
export async function pushApplePassUpdate(userId: string, tenantId: string): Promise<void> {
  if (!isApplePassConfigured()) return;
  const regs = await prisma.applePassRegistration.findMany({
    where: { userId, tenantId },
    select: { id: true, pushToken: true },
  });
  await Promise.all(
    regs.map(async (reg) => {
      const result = await sendPassPush(reg.pushToken);
      if (result === "gone") {
        await prisma.applePassRegistration.delete({ where: { id: reg.id } }).catch(() => {});
      }
    }),
  );
}
