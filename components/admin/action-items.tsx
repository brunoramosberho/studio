"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
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

interface PillConfig {
  icon: LucideIcon;
  label: (count: number) => string;
}

const PILLS: Record<ActionItemKey, PillConfig> = {
  no_shows: {
    icon: AlertTriangle,
    label: (c) => (c === 1 ? "1 no-show por revisar" : `${c} no-shows por revisar`),
  },
  connect_missing: {
    icon: CreditCard,
    label: () => "Conectar tu cuenta de Stripe",
  },
  connect_pending: {
    icon: CreditCard,
    label: () => "Stripe: verificación pendiente",
  },
  connect_restricted: {
    icon: CreditCard,
    label: () => "Stripe: cuenta restringida",
  },
  trial_ending: {
    icon: Clock,
    label: (days) =>
      days === 0
        ? "Tu trial termina hoy"
        : days === 1
          ? "Tu trial termina mañana"
          : `Tu trial termina en ${days} días`,
  },
  saas_payment_failed: {
    icon: AlertCircle,
    label: () => "Tu suscripción tiene un pago fallido",
  },
  platform_alerts: {
    icon: Layers,
    label: (c) => (c === 1 ? "1 alerta de plataformas" : `${c} alertas de plataformas`),
  },
  open_debts: {
    icon: Banknote,
    label: (c) => (c === 1 ? "1 deuda abierta" : `${c} deudas abiertas`),
  },
  pending_availability: {
    icon: CalendarOff,
    label: (c) =>
      c === 1
        ? "1 solicitud de disponibilidad"
        : `${c} solicitudes de disponibilidad`,
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
        {hasUrgent ? "Necesita tu atención" : "Para revisar"}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <ActionPill key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

function ActionPill({ item }: { item: ActionItem }) {
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
      <span>{cfg.label(item.count)}</span>
      <ChevronRight className="h-3 w-3 opacity-50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
