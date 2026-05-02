import {
  cloudflareAccountId,
  cloudflareStreamApiToken,
} from "./env";

const STREAM_API_BASE = "https://api.cloudflare.com/client/v4";

interface CloudflareApiResponse<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

interface StreamVideoMeta {
  uid: string;
  duration?: number;
  status?: { state?: string; errorReasonText?: string };
  thumbnail?: string;
  input?: { width?: number; height?: number };
  meta?: Record<string, string | number | boolean | null>;
  readyToStream?: boolean;
}

interface DirectUploadResponse {
  uploadURL: string;
  uid: string;
}

async function request<T>(
  path: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<T> {
  const accountId = cloudflareAccountId();
  const url = `${STREAM_API_BASE}/accounts/${accountId}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cloudflareStreamApiToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cloudflare Stream API error ${res.status}: ${body}`);
  }
  const json = (await res.json()) as CloudflareApiResponse<T>;
  if (!json.success) {
    const msg = json.errors?.map((e) => `${e.code}:${e.message}`).join(", ") ?? "unknown";
    throw new Error(`Cloudflare Stream API failed: ${msg}`);
  }
  return json.result;
}

/**
 * Request a one-time TUS upload URL. The frontend then uploads directly to
 * Cloudflare via the TUS protocol — bytes never pass through Vercel.
 *
 * `uploadLength` is the file size in bytes. Cloudflare requires it upfront
 * (TUS spec `Upload-Length` header) because Stream rejects deferred-length
 * uploads.
 */
export async function createDirectUpload(params: {
  uploadLength: number;
  maxDurationSeconds?: number;
  meta?: Record<string, string>;
  requireSignedURLs?: boolean;
  /**
   * Hosts allowed to perform the browser-side TUS upload (CORS).
   * Pass hostnames only (e.g. ["betoro.localhost:3000", "*.mgic.app"]).
   * Cloudflare echoes these into the upload's CORS allowlist.
   */
  allowedOrigins?: string[];
}): Promise<DirectUploadResponse> {
  // Cloudflare's TUS upload endpoint sits at /stream and uses a special POST
  // contract: empty body + custom headers. The response Location header is
  // the resumable upload URL; the Stream-Media-Id header is the future video uid.
  //
  // `direct_user=true` is REQUIRED for browser-side uploads. Without it, Cloudflare
  // returns a Location on the auth-gated `edge-production.gateway.api.cloudflare.com`
  // endpoint, which rejects CORS preflights (no `Access-Control-Allow-Origin` and
  // requires `Authorization` headers the browser cannot supply on resumable PATCHes).
  // With the flag set, the Location points to `upload.videodelivery.net`-style
  // tokenized URL that handles CORS correctly.
  const accountId = cloudflareAccountId();
  const url = `${STREAM_API_BASE}/accounts/${accountId}/stream?direct_user=true`;

  if (!Number.isFinite(params.uploadLength) || params.uploadLength <= 0) {
    throw new Error("uploadLength must be a positive integer");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cloudflareStreamApiToken()}`,
    "Tus-Resumable": "1.0.0",
    "Upload-Length": String(Math.floor(params.uploadLength)),
  };

  const metaParts: string[] = [];
  if (params.meta) {
    for (const [k, v] of Object.entries(params.meta)) {
      metaParts.push(`${k} ${Buffer.from(v).toString("base64")}`);
    }
  }
  if (params.maxDurationSeconds) {
    metaParts.push(
      `maxDurationSeconds ${Buffer.from(String(params.maxDurationSeconds)).toString("base64")}`,
    );
  }
  if (params.requireSignedURLs !== false) {
    metaParts.push(`requiresignedurls ${Buffer.from("true").toString("base64")}`);
  }
  if (params.allowedOrigins && params.allowedOrigins.length > 0) {
    const value = params.allowedOrigins.join(",");
    metaParts.push(
      `allowedorigins ${Buffer.from(value).toString("base64")}`,
    );
  }
  if (metaParts.length) {
    headers["Upload-Metadata"] = metaParts.join(",");
  }

  const res = await fetch(url, { method: "POST", headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cloudflare Stream TUS create failed (${res.status}): ${body}`);
  }
  const uploadURL = res.headers.get("location");
  const uid = res.headers.get("stream-media-id");
  if (!uploadURL || !uid) {
    throw new Error("Cloudflare Stream TUS create returned no upload URL");
  }
  return { uploadURL, uid };
}

export async function getVideoMeta(uid: string): Promise<StreamVideoMeta> {
  return request<StreamVideoMeta>(`/stream/${uid}`, { method: "GET" });
}

export async function deleteVideo(uid: string): Promise<void> {
  await request<unknown>(`/stream/${uid}`, { method: "DELETE" });
}

export async function setRequireSignedURLs(uid: string, value: boolean): Promise<void> {
  await request<unknown>(`/stream/${uid}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requireSignedURLs: value }),
  });
}
