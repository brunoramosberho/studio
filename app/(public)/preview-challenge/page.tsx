import PreviewClient from "./preview-client";

/**
 * A gallery of every challenge-card state, rendered with the tenant's own
 * branding so a studio can be shown how the feature looks to a member before
 * they have a real challenge running.
 *
 * Deliberately open, including in production: this is here to be shared. It is
 * unlinked from anywhere in the app and marked noindex, so the only way in is
 * the URL itself. The data is mock and lives in the page — nothing here reads
 * or writes a real challenge.
 *
 * Meant to be temporary. Delete the route once the studios have seen it.
 */
export default function PreviewChallengePage() {
  return <PreviewClient />;
}

export const metadata = {
  robots: { index: false, follow: false },
};
