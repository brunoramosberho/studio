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
 */
export async function createDirectUpload(params: {
  maxDurationSeconds?: number;
  meta?: Record<string, string>;
  requireSignedURLs?: boolean;
}): Promise<DirectUploadResponse> {
  // Cloudflare's TUS upload endpoint sits at /stream and uses a special POST
  // contract: empty body + custom headers. The response Location header is
  // the resumable upload URL; the Stream-Media-Id header is the future video uid.
  const accountId = cloudflareAccountId();
  const url = `${STREAM_API_BASE}/accounts/${accountId}/stream`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cloudflareStreamApiToken()}`,
    "Tus-Resumable": "1.0.0",
    "Upload-Length": "0",
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
