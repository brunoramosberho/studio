"use client";

import { useEffect } from "react";

/**
 * Shared inner content for the global error boundaries (app/error.tsx and
 * app/global-error.tsx). Recovers gracefully from stale-session errors
 * by clearing auth cookies and bouncing to /login automatically.
 *
 * Recovery heuristic: server-side `requireAuth` / `requireRole` /
 * `getTenant` throw with messages like "Unauthorized", "Forbidden",
 * "Tenant not found", "Not a member of this studio", "Insufficient
 * role". When we see any of those, we wipe the auth cookies for the
 * current host and redirect to /login. The user lands on a fresh login
 * screen instead of staring at the default Next.js error UI.
 */

const AUTH_ERROR_PATTERNS = [
  /unauthorized/i,
  /forbidden/i,
  /tenant not found/i,
  /not a member/i,
  /insufficient role/i,
  /not signed in/i,
  /session expired/i,
];

const AUTH_COOKIE_PATTERNS = [
  /^(__Secure-)?authjs\./i, // NextAuth — all variants (admin/client/super)
  /^next-auth\./i,
  /^__Host-authjs\./i,
];

function clearAuthCookies() {
  if (typeof document === "undefined") return;
  const cookies = document.cookie.split(";");
  const host = window.location.hostname;
  const parentDomain = host.split(".").slice(-2).join(".");
  for (const raw of cookies) {
    const name = raw.split("=")[0].trim();
    if (!name) continue;
    if (!AUTH_COOKIE_PATTERNS.some((p) => p.test(name))) continue;
    const expire = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = `${name}=; ${expire}; path=/`;
    document.cookie = `${name}=; ${expire}; path=/; domain=${host}`;
    document.cookie = `${name}=; ${expire}; path=/; domain=.${host}`;
    document.cookie = `${name}=; ${expire}; path=/; domain=.${parentDomain}`;
  }
}

export function ErrorBoundaryContent({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Pure derivation from the error — no setState gymnastics in render.
  const recovering = AUTH_ERROR_PATTERNS.some((p) =>
    p.test(error.message || ""),
  );

  useEffect(() => {
    // Always surface the message so Vercel runtime logs catch it.
    console.error("Render error caught by global boundary:", error);

    if (!recovering) return;
    clearAuthCookies();
    const t = setTimeout(() => {
      window.location.replace("/login");
    }, 400);
    return () => clearTimeout(t);
  }, [error, recovering]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-stone-900">
          {recovering ? "Limpiando sesión…" : "Algo salió mal"}
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          {recovering
            ? "Detectamos un problema con tu sesión. Te enviamos al inicio en un momento."
            : "Tuvimos un problema cargando esta página. Intenta de nuevo o vuelve al inicio."}
        </p>
        {!recovering && (
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
            >
              Reintentar
            </button>
            <a
              href="/login"
              className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
            >
              Volver al inicio de sesión
            </a>
          </div>
        )}
        {error.digest && (
          <p className="mt-6 text-[10px] uppercase tracking-wide text-stone-400">
            Ref: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
