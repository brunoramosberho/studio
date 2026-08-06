// One-time codes for the self-serve Wellhub email claim ("Connected apps" in
// the member profile). Pure helpers — DB access and rate limiting live in the
// API routes so these stay unit-testable.

import { createHash, randomInt, timingSafeEqual } from "crypto";

/** Codes die after 10 minutes; a fresh request invalidates older ones. */
export const WELLHUB_LINK_CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses allowed per code before the member must request a new one. */
export const WELLHUB_LINK_CODE_MAX_ATTEMPTS = 5;
/** Minimum wait between two send-code requests. */
export const WELLHUB_LINK_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
/** Send-code requests allowed per member+tenant per rolling hour. */
export const WELLHUB_LINK_CODE_HOURLY_CAP = 5;

/** Six digits, zero-padded, from the CSPRNG. */
export function generateLinkCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Codes are stored hashed, salted with the row id so equal codes in different
 * rows don't share a digest. sha256 (not bcrypt) is deliberate: the search
 * space is 10^6 either way — the attempt cap is the real defence, the hash
 * only keeps raw codes out of the table.
 */
export function hashLinkCode(rowId: string, code: string): string {
  return createHash("sha256").update(`${rowId}:${code}`).digest("hex");
}

export function linkCodeMatches(rowId: string, code: string, codeHash: string): boolean {
  const candidate = Buffer.from(hashLinkCode(rowId, code), "hex");
  const stored = Buffer.from(codeHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/**
 * Trim + lowercase, and a sanity-only shape check (the one-time code is the
 * real proof of validity). Returns null when the input can't be an address.
 */
export function normalizeClaimEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}
