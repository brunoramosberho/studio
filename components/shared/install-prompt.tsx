"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { X, ArrowRight } from "lucide-react";
import { getMobileInstallPlatform, isStandalonePWA } from "@/lib/pwa-install";
import { useBranding } from "@/components/branding-provider";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "pwa-install-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function wasDismissedRecently(): boolean {
  try {
    const ts = localStorage.getItem(DISMISSED_KEY);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
  } catch {
    /* ignore */
  }
}

export function InstallPrompt() {
  const pathname = usePathname();
  const t = useTranslations("install");
  const brand = useBranding();
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
    markDismissed();
  }, []);

  useEffect(() => {
    if (
      isStandalonePWA() ||
      wasDismissedRecently() ||
      pathname === "/install" ||
      pathname.startsWith("/embed")
    )
      return;

    const plat = getMobileInstallPlatform();
    if (!plat) return;

    // On iOS only Safari can add to the home screen; the /install page guides
    // users on other browsers, but we don't nag them here.
    if (plat === "ios") {
      const isSafari =
        /Safari/i.test(navigator.userAgent) &&
        !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(navigator.userAgent);
      if (!isSafari) return;
    }

    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!visible) return null;

  // Absolute URL to the tenant's own install page so it works even when the
  // schedule is embedded in an iframe (opens the real tenant page in a new tab,
  // where the device-specific instructions live and the PWA scope is correct).
  const installUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/install`
      : "/install";

  const initials = brand.studioName.slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[72px] z-[60] mx-auto max-w-sm px-4 md:hidden",
        "animate-in slide-in-from-bottom-4 fade-in duration-500",
      )}
    >
      <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-background shadow-xl shadow-foreground/10">
        {/* Soft accent wash behind the icon */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{
            background: `linear-gradient(180deg, ${brand.colorAccent}14, transparent)`,
          }}
        />

        <button
          onClick={dismiss}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label={t("close")}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-5">
          <div className="flex items-center gap-4">
            {/* iOS-style app icon (squircle) */}
            {brand.appIconUrl ? (
              <img
                src={brand.appIconUrl}
                alt={brand.studioName}
                className="h-16 w-16 shrink-0 rounded-[18px] object-cover ring-1 ring-black/5"
                style={{ boxShadow: "0 6px 18px rgba(0,0,0,0.14)" }}
              />
            ) : (
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px]"
                style={{
                  background: brand.colorAccent,
                  boxShadow: `0 6px 18px ${brand.colorAccent}55`,
                }}
              >
                <span className="text-2xl font-bold text-white">{initials}</span>
              </div>
            )}

            <div className="min-w-0 flex-1 pr-6">
              <p className="truncate font-display text-[16px] font-bold text-foreground">
                {t("installTitle", { name: brand.studioName })}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">
                {t("installSubtitle")}
              </p>
            </div>
          </div>

          <a
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[15px] font-semibold text-white shadow-sm transition-transform active:scale-[0.98]"
            style={{ background: brand.colorAccent }}
          >
            {t("installButton")}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
