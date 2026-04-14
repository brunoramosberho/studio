"use client";

import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeMode } from "@/components/theme-provider";

interface ThemeToggleProps {
  /** "segmented" = three-state pill (light / system / dark). "icon" = single cycling button. */
  variant?: "segmented" | "icon";
  className?: string;
}

const OPTIONS: { value: ThemeMode; Icon: typeof Sun; labelKey: string }[] = [
  { value: "light", Icon: Sun, labelKey: "themeLight" },
  { value: "system", Icon: Monitor, labelKey: "themeSystem" },
  { value: "dark", Icon: Moon, labelKey: "themeDark" },
];

export function ThemeToggle({
  variant = "segmented",
  className,
}: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const t = useTranslations("common");

  if (variant === "icon") {
    // Cycle: light → dark → system → light
    const next: Record<ThemeMode, ThemeMode> = {
      light: "dark",
      dark: "system",
      system: "light",
    };
    const Icon =
      theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
    return (
      <button
        type="button"
        aria-label={safeT(t, "themeToggle", "Theme")}
        onClick={() => setTheme(next[theme])}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground",
          className,
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={safeT(t, "themeToggle", "Theme")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, Icon, labelKey }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={safeT(t, labelKey, defaultLabel(value))}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-[var(--shadow-warm-sm)]"
                : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

/** Fall back gracefully if translation keys aren't present yet. */
function safeT(
  t: ReturnType<typeof useTranslations>,
  key: string,
  fallback: string,
): string {
  try {
    const value = t(key);
    // next-intl returns the key itself when it's missing.
    return value === key ? fallback : value;
  } catch {
    return fallback;
  }
}

function defaultLabel(v: ThemeMode): string {
  return v === "light" ? "Light" : v === "dark" ? "Dark" : "System";
}
