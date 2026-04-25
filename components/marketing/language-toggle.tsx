"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

const LOCALES = ["es", "en"] as const;

interface MarketingLanguageToggleProps {
  /** Tailwind class to apply to the wrapping container */
  className?: string;
}

export function MarketingLanguageToggle({ className }: MarketingLanguageToggleProps) {
  const current = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setLocale(next: string) {
    if (next === current || isPending) return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={`inline-flex items-center rounded-full border border-border bg-white p-0.5 text-xs font-semibold ${
        className ?? ""
      }`}
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => setLocale(loc)}
            aria-pressed={active}
            disabled={isPending}
            className={`rounded-full px-2.5 py-1 uppercase tracking-wider transition-colors ${
              active
                ? "bg-foreground text-white"
                : "text-muted hover:text-foreground"
            } ${isPending ? "opacity-50" : ""}`}
          >
            {loc}
          </button>
        );
      })}
    </div>
  );
}
