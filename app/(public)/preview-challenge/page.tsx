import { timingSafeEqual } from "node:crypto";
import { notFound } from "next/navigation";
import PreviewClient from "./preview-client";

/**
 * A gallery of every challenge-card state, for showing a studio how the feature
 * looks to a member before they have a real challenge running.
 *
 * It lives under `(public)`, so on a tenant domain it renders with that
 * studio's branding — which is the point, and also the risk: without a gate it
 * would be a live page on every customer's domain showing a fake challenge.
 *
 * So it needs `?key=` matching CHALLENGE_PREVIEW_KEY, except in local
 * development. A wrong or missing key gives a 404 rather than a 403: someone
 * probing shouldn't learn the page is there at all.
 */

function keyMatches(given: string | undefined): boolean {
  const expected = process.env.CHALLENGE_PREVIEW_KEY;

  // Fail shut. An unset variable in production must close the page, never open
  // it — "forgot to configure it" has to land on the safe side.
  if (!expected || expected.length < 16) return false;
  if (!given) return false;

  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, and the length is not worth
  // protecting here — but the comparison of equal-length keys is.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function PreviewChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  // Local development stays open, so the gallery is still one URL away while
  // working on the card.
  if (process.env.VERCEL_ENV === "production") {
    const { key } = await searchParams;
    if (!keyMatches(key)) notFound();
  }

  return <PreviewClient />;
}

/** A link that gets forwarded should still never turn up in a search result. */
export const metadata = {
  robots: { index: false, follow: false },
};
