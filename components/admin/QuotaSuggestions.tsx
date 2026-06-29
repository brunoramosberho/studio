"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { QuotaSuggestion } from "@/lib/platforms/quota-suggestions";

interface QuotaSuggestionsResponse {
  enabled: boolean;
  suggestions: QuotaSuggestion[];
}

// "raise" suggestions are revenue opportunities (emerald accent); "lower" are
// neutral housekeeping hints (amber accent).
const TYPE_STYLES: Record<QuotaSuggestion["type"], { card: string; icon: string }> = {
  raise: {
    card: "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    icon: "text-emerald-600 dark:text-emerald-300",
  },
  lower: {
    card: "border-amber-200/70 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10",
    icon: "text-amber-600 dark:text-amber-300",
  },
};

function formatClassTime(startsAt: string): string {
  // Display-only; render in the viewer's locale with a compact day + time.
  return new Date(startsAt).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function QuotaSuggestions() {
  const t = useTranslations("admin.quotaSuggestions");
  const { data } = useQuery<QuotaSuggestionsResponse>({
    queryKey: ["admin-quota-suggestions"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/quota-suggestions");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const suggestions = data?.suggestions ?? [];
  if (!data?.enabled || suggestions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted/60">
        {t("heading")}
      </p>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <SuggestionCard key={`${s.classId}-${s.type}`} suggestion={s} t={t} />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  t,
}: {
  suggestion: QuotaSuggestion;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const styles = TYPE_STYLES[s.type];
  const Icon = s.type === "raise" ? TrendingUp : TrendingDown;
  const href = `/admin/platforms?tab=quotas&editClass=${encodeURIComponent(
    s.classId,
  )}&suggestWellhub=${s.suggestedQuota}`;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between",
        styles.card,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", styles.icon)} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="truncate text-sm font-semibold">{s.className}</p>
            <span className="text-xs text-muted">{formatClassTime(s.startsAt)}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted">{s.reason}</p>
          <p className="mt-1 text-xs font-medium">
            {t("quotaChange", { current: s.currentQuota, suggested: s.suggestedQuota })}
          </p>
        </div>
      </div>

      <Button
        asChild
        size="sm"
        variant={s.type === "raise" ? "default" : "outline"}
        className="shrink-0 self-start gap-1 sm:self-center"
      >
        <Link href={href}>
          {s.type === "raise" ? t("raiseCta") : t("lowerCta")}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
