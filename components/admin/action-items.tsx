"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  CreditCard,
  Banknote,
  Layers,
  CalendarOff,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ActionItem,
  ActionItemKey,
  ActionItemSeverity,
  ActionItemsResponse,
} from "@/app/api/admin/action-items/route";

type LabelFn = (
  t: (key: string, values?: Record<string, string | number>) => string,
  count: number,
) => string;

const PILLS: Record<ActionItemKey, { icon: LucideIcon; label: LabelFn }> = {
  no_shows: {
    icon: AlertTriangle,
    label: (t, c) =>
      c === 1
        ? t("admin.actionItems.noShowsOne")
        : t("admin.actionItems.noShowsMany", { count: c }),
  },
  connect_missing: {
    icon: CreditCard,
    label: (t) => t("admin.actionItems.connectMissing"),
  },
  connect_pending: {
    icon: CreditCard,
    label: (t) => t("admin.actionItems.connectPending"),
  },
  connect_restricted: {
    icon: CreditCard,
    label: (t) => t("admin.actionItems.connectRestricted"),
  },
  trial_ending: {
    icon: Clock,
    label: (t, days) =>
      days === 0
        ? t("admin.actionItems.trialEndingToday")
        : days === 1
          ? t("admin.actionItems.trialEndingTomorrow")
          : t("admin.actionItems.trialEndingDays", { days }),
  },
  saas_payment_failed: {
    icon: AlertCircle,
    label: (t) => t("admin.actionItems.saasPaymentFailed"),
  },
  platform_alerts: {
    icon: Layers,
    label: (t, c) =>
      c === 1
        ? t("admin.actionItems.platformAlertsOne")
        : t("admin.actionItems.platformAlertsMany", { count: c }),
  },
  open_debts: {
    icon: Banknote,
    label: (t, c) =>
      c === 1
        ? t("admin.actionItems.openDebtsOne")
        : t("admin.actionItems.openDebtsMany", { count: c }),
  },
  pending_availability: {
    icon: CalendarOff,
    label: (t, c) =>
      c === 1
        ? t("admin.actionItems.pendingAvailabilityOne")
        : t("admin.actionItems.pendingAvailabilityMany", { count: c }),
  },
};

const SEVERITY_STYLES: Record<ActionItemSeverity, string> = {
  urgent:
    "border-red-200/70 bg-red-50/80 text-red-900 hover:bg-red-100/80 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
  warning:
    "border-amber-200/70 bg-amber-50/80 text-amber-900 hover:bg-amber-100/80 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  info:
    "border-sky-200/70 bg-sky-50/80 text-sky-900 hover:bg-sky-100/80 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
};

const SEVERITY_ICON_STYLES: Record<ActionItemSeverity, string> = {
  urgent: "text-red-600 dark:text-red-300",
  warning: "text-amber-600 dark:text-amber-300",
  info: "text-sky-600 dark:text-sky-300",
};

export function AdminActionItems() {
  const t = useTranslations();
  const { data } = useQuery<ActionItemsResponse>({
    queryKey: ["admin-action-items"],
    queryFn: async () => {
      const res = await fetch("/api/admin/action-items");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const hasUrgent = items.some((i) => i.severity === "urgent");

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted/60">
        {hasUrgent
          ? t("admin.actionItems.needsAttention")
          : t("admin.actionItems.toReview")}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <ActionPill key={item.key} item={item} t={t} />
        ))}
      </div>
    </div>
  );
}

function ActionPill({
  item,
  t,
}: {
  item: ActionItem;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const cfg = PILLS[item.key];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
        SEVERITY_STYLES[item.severity],
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", SEVERITY_ICON_STYLES[item.severity])} />
      <span>{cfg.label(t, item.count)}</span>
      <ChevronRight className="h-3 w-3 opacity-50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
