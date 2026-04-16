"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink, ArrowUpRight, X } from "lucide-react";
import { getInAppBrowser, type InAppBrowser } from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "in-app-banner-dismissed";

const appNames: Record<NonNullable<InAppBrowser>, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  twitter: "X",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
};

export function InAppBrowserBanner() {
  const t = useTranslations("common");
  const pathname = usePathname();
  const [browser, setBrowser] = useState<InAppBrowser>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (pathname.startsWith("/embed")) return;
    const detected = getInAppBrowser();
    if (!detected) return;

    try {
      const ts = sessionStorage.getItem(DISMISSED_KEY);
      if (ts) return;
    } catch {}

    setBrowser(detected);
    setDismissed(false);
  }, [pathname]);

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }

  function handleOpen() {
    const url = window.location.href;
    window.open(url, "_blank");
  }

  if (dismissed || !browser) return null;

  return (
    <div
      className={cn(
        "sticky top-0 z-[70] w-full",
        "animate-in slide-in-from-top-2 fade-in duration-300",
      )}
    >
      <div className="flex items-center gap-3 bg-foreground px-4 py-2.5">
        <ExternalLink className="h-4 w-4 shrink-0 text-background/70" />
        <button
          onClick={handleOpen}
          className="flex flex-1 items-center gap-1.5 text-left"
        >
          <span className="text-[13px] font-medium leading-tight text-background">
            {t("openInBrowser")}
          </span>
          <span className="text-[13px] leading-tight text-background/60">
            {t("forBetterExperience")}
          </span>
          <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-background/70" />
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-full p-1 text-background/50 transition-colors active:bg-background/10"
          aria-label={t("close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
