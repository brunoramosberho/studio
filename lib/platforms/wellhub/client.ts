import { WellhubApiError, WellhubConfigError } from "./errors";

// ─── Base URLs ────────────────────────────────────────────────────────────

const BOOKING_BASE_URL = {
  production: "https://api.partners.gympass.com",
  sandbox: "https://apitesting.partners.gympass.com",
} as const;

// Access Control shares Booking's host per the spec.
const ACCESS_BASE_URL = BOOKING_BASE_URL;

// The Integration Setup API uses a distinct host with no sandbox variant
// documented (only production is published).
const SETUP_BASE_URL = "https://api.partners-integrations.gympass.com";

export type WellhubEnv = "production" | "sandbox";

export function getWellhubEnv(): WellhubEnv {
  return process.env.WELLHUB_ENV === "production" ? "production" : "sandbox";
}

export function getWellhubAuthToken(): string {
  const token = process.env.WELLHUB_AUTH_TOKEN;
  if (!token) {
    throw new WellhubConfigError(
      "WELLHUB_AUTH_TOKEN is not set. Request a partner token from managedservices@gympass.com.",
    );
  }
  return token;
}

export function getBookingBaseUrl(): string {
  return BOOKING_BASE_URL[getWellhubEnv()];
}

export function getAccessBaseUrl(): string {
  return ACCESS_BASE_URL[getWellhubEnv()];
}

export function getSetupBaseUrl(): string {
  return SETUP_BASE_URL;
}

// ─── Fetch wrapper ────────────────────────────────────────────────────────

export interface WellhubFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Sets the `X-Gym-Id` header (required by Access Control). */
  gymId?: number;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Override the bearer token (for SaaS-multitenant overrides in the future). */
  token?: string;
  /** Override Accept header. Defaults to application/json. */
  accept?: string;
}

async function wellhubFetch<T>(
  baseUrl: string,
  path: string,
  opts: WellhubFetchOptions = {},
): Promise<T> {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const token = opts.token ?? getWellhubAuthToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
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

export function bookingApi<T>(path: string, opts: WellhubFetchOptions = {}) {
  return wellhubFetch<T>(getBookingBaseUrl(), path, opts);
}

export function accessApi<T>(path: string, opts: WellhubFetchOptions = {}) {
  return wellhubFetch<T>(getAccessBaseUrl(), path, opts);
}

export function setupApi<T>(path: string, opts: WellhubFetchOptions = {}) {
  return wellhubFetch<T>(getSetupBaseUrl(), path, opts);
}

// ─── Health probe ─────────────────────────────────────────────────────────

export async function bookingHealth(): Promise<"ok"> {
  return bookingApi<"ok">("/booking/v1/health", { accept: "text/plain" });
}
