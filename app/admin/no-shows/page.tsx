"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  Check,
  DollarSign,
  Loader2,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/components/tenant-provider";
import { formatMoney as formatMoneyWithCurrency } from "@/lib/currency";

type ActionKind = "confirm" | "waive" | "revert";

interface PendingItem {
  id: string;
  status: "pending" | "confirmed" | "waived" | "reverted";
  createdAt: string;
  autoConfirmAt: string | null;
  resolvedAt: string | null;
  loseCredit: boolean;
  chargeFee: boolean;
  feeAmountCents: number;
  isUnlimited: boolean;
  user: { id: string | null; name: string | null; email: string | null; image: string | null } | null;
  booking: { id: string; status: string };
  class: {
    id: string;
    startsAt: string;
    endsAt: string;
    classType: { name: string; color: string };
    coach: { name: string | null };
  } | null;
}

interface ListResponse {
  items: PendingItem[];
}

function formatDateLabel(date: Date): string {
  if (isToday(date)) return "Hoy";
  if (isYesterday(date)) return "Ayer";
  return format(date, "EEEE d 'de' MMMM", { locale: es })
    .replace(/^./, (c) => c.toUpperCase());
}

function groupByDay(items: PendingItem[]): Array<{ key: string; label: string; items: PendingItem[] }> {
  const map = new Map<string, PendingItem[]>();
  for (const it of items) {
    const anchor = it.class?.startsAt ?? it.createdAt;
    const d = new Date(anchor);
    const key = format(d, "yyyy-MM-dd");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({
      key,
      label: formatDateLabel(new Date(items[0].class?.startsAt ?? items[0].createdAt)),
      items,
    }));
}

export default function NoShowsPage() {
  const t = useTranslations("admin.noShowsPage");
  const [activeTab, setActiveTab] = useState<"pending" | "confirmed" | "waived" | "reverted">(
    "pending",
  );
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ["admin-no-shows", activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/admin/no-shows?status=${activeTab}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const groups = useMemo(() => groupByDay(items), [items]);

  const resolveMutation = useMutation({
    mutationFn: async (params: { id: string; action: ActionKind }) => {
      const res = await fetch(`/api/admin/no-shows/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: params.action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.action === "confirm"
          ? t("confirmed")
          : vars.action === "waive"
            ? t("waived")
            : t("reverted"),
      );
      qc.invalidateQueries({ queryKey: ["admin-no-shows"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || t("actionError"));
    },
  });

  const bulkConfirm = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/admin/no-shows/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "confirm" }),
          }),
        ),
      );
    },
    onSuccess: () => {
      toast.success(t("bulkConfirmed"));
      qc.invalidateQueries({ queryKey: ["admin-no-shows"] });
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
          <ShieldAlert className="h-5 w-5 text-red-500" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50">
        {(["pending", "confirmed", "waived", "reverted"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "border-b-2 border-admin text-admin"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t(`tab.${tab}`)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-card p-12 text-center">
          <p className="text-sm text-muted">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeTab === "pending" && items.length > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-card p-3">
              <p className="text-sm text-muted">
                {t("bulkPrompt", { count: items.length })}
              </p>
              <Button
                size="sm"
                onClick={() => bulkConfirm.mutate(items.map((i) => i.id))}
                disabled={bulkConfirm.isPending}
                className="gap-2 bg-admin hover:bg-admin/90"
              >
                {bulkConfirm.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("bulkConfirm")}
              </Button>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted">{g.label}</h2>
              <div className="divide-y divide-border/40 rounded-xl border border-border/50 bg-card overflow-hidden">
                {g.items.map((item) => (
                  <NoShowRow
                    key={item.id}
                    item={item}
                    onAction={(action) => resolveMutation.mutate({ id: item.id, action })}
                    disabled={resolveMutation.isPending}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NoShowRow({
  item,
  onAction,
  disabled,
}: {
  item: PendingItem;
  onAction: (action: ActionKind) => void;
  disabled: boolean;
}) {
  const t = useTranslations("admin.noShowsPage");
  const currency = useCurrency();
  const displayName = item.user?.name || item.user?.email || "—";
  const classLabel = item.class
    ? `${item.class.classType.name} · ${format(new Date(item.class.startsAt), "HH:mm")}`
    : t("classRemoved");
  const coachName = item.class?.coach.name ?? "";
  const autoAt = item.autoConfirmAt ? new Date(item.autoConfirmAt) : null;

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{displayName}</span>
          {item.isUnlimited && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
              {t("unlimited")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted mt-0.5 truncate">
          {classLabel}
          {coachName && <span className="mx-1.5">·</span>}
          {coachName}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.loseCredit && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
              <AlertTriangle className="h-3 w-3" />
              {t("loseCreditBadge")}
            </span>
          )}
          {item.chargeFee && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
              <DollarSign className="h-3 w-3" />
              {formatMoneyWithCurrency(item.feeAmountCents / 100, currency)}
            </span>
          )}
          {item.status === "pending" && autoAt && (
            <span className="text-[11px] text-muted">
              {t("autoConfirmAt", {
                time: format(autoAt, "d MMM HH:mm", { locale: es }),
              })}
            </span>
          )}
        </div>
      </div>

      {item.status === "pending" && (
        <div className="flex gap-2 sm:flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction("revert")}
            disabled={disabled}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("revertShort")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction("waive")}
            disabled={disabled}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            {t("waiveShort")}
          </Button>
          <Button
            size="sm"
            onClick={() => onAction("confirm")}
            disabled={disabled}
            className="gap-1.5 bg-admin hover:bg-admin/90"
          >
            <Check className="h-3.5 w-3.5" />
            {t("confirmShort")}
          </Button>
        </div>
      )}
      {item.status !== "pending" && item.resolvedAt && (
        <span className="text-[11px] text-muted">
          {format(new Date(item.resolvedAt), "d MMM HH:mm", { locale: es })}
        </span>
      )}
    </div>
  );
}
