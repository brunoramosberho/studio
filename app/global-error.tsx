"use client";

import { ErrorBoundaryContent } from "./_components/error-boundary-content";

/**
 * Last-resort error boundary: catches errors that escape from the root
 * layout itself (where app/error.tsx can't reach). Must render the full
 * <html><body> wrapper because Next.js replaces the root layout when
 * this fires.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-stone-50">
        <ErrorBoundaryContent error={error} reset={reset} />
      </body>
    </html>
  );
}
