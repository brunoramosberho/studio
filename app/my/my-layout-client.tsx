"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DesktopSidebar } from "@/components/shared/desktop-sidebar";
import { PushManager } from "@/components/shared/push-manager";
import { PwaTracker } from "@/components/shared/pwa-tracker";
import { CityDetectPrompt } from "@/components/shared/city-detect-prompt";
export function MyLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();

  // Same verify-before-redirect pattern we use in admin-layout-client: the
  // shared next-auth `__NEXTAUTH` module singleton can leave the outer
  // SessionProvider with a stale `_getSession` (a no-op) after a nested
  // admin/coach SessionProvider has mounted and unmounted in the same tab,
  // causing useSession() to report a false `unauthenticated` here. Confirm
  // by hitting /api/auth/session directly before bouncing the user.
  useEffect(() => {
    if (status !== "unauthenticated") return;
    let cancelled = false;
    const verify = async () => {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        const data = res.ok ? await res.json() : null;
        if (data && (data as { user?: unknown }).user) return;
        const target = `/login?callbackUrl=${encodeURIComponent(
          pathname || "/my",
        )}`;
        router.replace(target);
      } catch {
        // Network blip — keep the user where they are
      }
    };
    const t = setTimeout(verify, 800);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [status, router, pathname]);

  if (status === "loading" || status === "unauthenticated") return null;

  return (
    <div className="min-h-dvh bg-background safe-top">
      <DesktopSidebar />

      <main className="pb-24 md:ml-64 md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          <CityDetectPrompt />
          {children}
        </div>
      </main>
      <PushManager />
      <PwaTracker />
    </div>
  );
}
