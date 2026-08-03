/**
 * Which pieces of the landing page a studio can rewrite.
 *
 * The landing ships with wording that suits a boutique fitness studio —
 * "From your phone to the reformer in three steps" — which reads as someone
 * else's copy the moment the studio teaches dance, or runs in a language the
 * default was never written for. Every key here is optional: leave it blank
 * and the shared translation for the studio's language is used.
 *
 * Keys match the `public` namespace in messages/*.json, so the placeholder an
 * admin sees in the form is exactly what their members see today.
 */
export const LANDING_COPY_KEYS = [
  "howItWorks",
  "howItWorksSubtitle",
  "step1Title",
  "step1Desc",
  "step2Title",
  "step2Desc",
  "step3Title",
  "step3Desc",
  "findYourPractice",
  "ourTeam",
  "coachesSubtitle",
  "packages",
  "packagesSubtitle",
  "locationsTitle",
  "readyToStart",
  "ctaSubtitle",
] as const;

export type LandingCopyKey = (typeof LANDING_COPY_KEYS)[number];

/**
 * Resolve a landing string: the studio's override if they wrote one, the
 * shared translation otherwise.
 */
export function landingText(
  copy: Record<string, string> | undefined,
  key: LandingCopyKey,
  fallback: string,
): string {
  const override = copy?.[key];
  return override && override.trim() ? override : fallback;
}
