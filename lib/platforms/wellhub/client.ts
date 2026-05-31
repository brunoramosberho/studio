import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { WellhubApiError, WellhubConfigError } from "./errors";

// ─── Base URLs ────────────────────────────────────────────────────────────

const BOOKING_BASE_URL = {
  production: "https://api.partners.gympass.com",
  sandbox: "https://apitesting.partners.gympass.com",
} as const;

// Access Control and Partner Products share Booking's host per the Postman
// reference (`/setup/v1/...` and `/access/v1/...` both live on the Booking
// host). There is no separate `partners-integrations` host in the
// direct-partner integration model.
const ACCESS_BASE_URL = BOOKING_BASE_URL;

export type WellhubEnv = "production" | "sandbox";

export function getWellhubEnv(): WellhubEnv {
  return process.env.WELLHUB_ENV === "production" ? "production" : "sandbox";
}

export function getBookingBaseUrl(): string {
  return BOOKING_BASE_URL[getWellhubEnv()];
}

export function getAccessBaseUrl(): string {
  return ACCESS_BASE_URL[getWellhubEnv()];
}

// ─── Per-tenant auth token ────────────────────────────────────────────────
//
// Each tenant configures their own bearer token (issued directly by Wellhub
// to the studio). The token is stored encrypted on
// `StudioPlatformConfig.wellhubAuthToken` and decrypted here on demand.

export async function getWellhubTokenForTenant(tenantId: string): Promise<string> {
  const config = await prisma.studioPlatformConfig.findUnique({
    where: { tenantId_platform: { tenantId, platform: "wellhub" } },
    select: { wellhubAuthToken: true },
  });
  if (!config?.wellhubAuthToken) {
    throw new WellhubConfigError(
      "No Wellhub auth token configured for this tenant. The studio admin must paste their bearer token in /admin/platforms/setup/wellhub.",
    );
  }
  try {
    return decrypt(config.wellhubAuthToken);
  } catch {
    throw new WellhubConfigError(
      "Failed to decrypt Wellhub auth token. The stored ciphertext may have been written with a different NEXTAUTH_SECRET.",
    );
  }
}

// ─── Fetch wrapper ────────────────────────────────────────────────────────

export interface WellhubFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Sets the `X-Gym-Id` header (required by Access Control). */
  gymId?: number;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /**
   * Bearer token to authenticate the call. REQUIRED — each tenant has its
   * own token. Get it via `getWellhubTokenForTenant(tenantId)`.
   */
  token: string;
  /** Override Accept header. Defaults to application/json. */
  accept?: string;
}

async function wellhubFetch<T>(
  baseUrl: string,
  path: string,
  opts: WellhubFetchOptions,
): Promise<T> {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  if (!opts.token) {
    throw new WellhubConfigError("Wellhub API call requires a per-tenant bearer token.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    Accept: opts.accept ?? "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.gymId !== undefined) headers["X-Gym-Id"] = String(opts.gymId);

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  // 204 = no body
  if (res.status === 204) return undefined as T;

  const rawText = await res.text();
  let parsed: unknown = null;
  if (rawText.length > 0) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Wellhub /booking/v1/health returns plain "ok"; fall back to raw text.
      parsed = rawText;
    }
  }

  if (!res.ok) {
    throw new WellhubApiError(
      res.status,
      parsed,
      `Wellhub ${opts.method ?? "GET"} ${url.pathname} → ${res.status}`,
    );
  }

  return parsed as T;
}

export function bookingApi<T>(path: string, opts: WellhubFetchOptions) {
  return wellhubFetch<T>(getBookingBaseUrl(), path, opts);
}

export function accessApi<T>(path: string, opts: WellhubFetchOptions) {
  return wellhubFetch<T>(getAccessBaseUrl(), path, opts);
}

// ─── Health probe ─────────────────────────────────────────────────────────
//
// /booking/v1/health is the standard liveness check. Pass any tenant's token
// — the endpoint only validates that the Authorization header is present and
// well-formed.

export async function bookingHealth(token: string): Promise<"ok"> {
  return bookingApi<"ok">("/booking/v1/health", { token, accept: "text/plain" });
}
