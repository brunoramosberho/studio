"use client";

import { ErrorBoundaryContent } from "./_components/error-boundary-content";

/**
 * Catches errors thrown inside any nested route segment under app/. The
 * root layout (and its providers) is preserved when this renders — for
 * errors in the root layout itself, see app/global-error.tsx.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryContent error={error} reset={reset} />;
}
