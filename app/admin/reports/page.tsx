"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  Download,
  Package,
  Search,
  ShoppingBag,
  Star,
  Users,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/components/tenant-provider";
import { formatMoney } from "@/lib/currency";
import { SectionTabs } from "@/components/admin/section-tabs";
import { INSIGHTS_TABS } from "@/components/admin/section-tab-configs";

// ─── Catalog (must mirror lib/reports/registry ids) ─────

type Category = "classes" | "memberships" | "sales" | "customers";

const CATALOG: { id: string; category: Category; snapshot?: boolean }[] = [
  { id: "class-occupancy", category: "classes" },
  { id: "no-shows", category: "classes" },
  { id: "late-cancels", category: "classes" },
  { id: "membership-sales", category: "memberships" },
  { id: "upcoming-renewals", category: "memberships" },
  { id: "expirations", category: "memberships" },
  { id: "outstanding-credits", category: "memberships", snapshot: true },
  { id: "sales", category: "sales" },
  { id: "product-sales", category: "sales" },
  { id: "refunds-debts", category: "sales" },
  { id: "customer-list", category: "customers", snapshot: true },
  { id: "new-members", category: "customers" },
];

const CATEGORY_ICONS: Record<Category, typeof Users> = {
  classes: CalendarDays,
  memberships: Package,
  sales: ShoppingBag,
  customers: Users,
};

// ─── Favorites (persisted in localStorage) ──────────────
// useSyncExternalStore avoids both setState-in-effect and hydration drift;
// the parsed array is cached by raw string so snapshots stay referentially stable.

const FAVS_KEY = "mgic_report_favs";
const EMPTY_FAVS: string[] = [];
const favListeners = new Set<() => void>();
let favsCacheRaw: string | null = null;
let favsCache: string[] = EMPTY_FAVS;

function favsSubscribe(cb: () => void) {
  favListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    favListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function favsSnapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(FAVS_KEY);
  } catch {}
  if (raw !== favsCacheRaw) {
    favsCacheRaw = raw;
    try {
      favsCache = raw ? (JSON.parse(raw) as string[]) : EMPTY_FAVS;
    } catch {
      favsCache = EMPTY_FAVS;
    }
  }
  return favsCache;
}
function favsServerSnapshot(): string[] {
  return EMPTY_FAVS;
}
function toggleFavStored(id: string) {
  const current = favsSnapshot();
  const next = current.includes(id)
    ? current.filter((f) => f !== id)
    : [...current, id];
  try {
    localStorage.setItem(FAVS_KEY, JSON.stringify(next));
  } catch {}
  favListeners.forEach((cb) => cb());
}

// ─── Date presets (shared shape with Insights) ──────────

type Preset = "7d" | "30d" | "month" | "lastMonth" | "90d" | "year";

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);
  switch (preset) {
    case "7d":
      return { from: iso(daysAgo(6)), to: iso(now) };
    case "month":
      return {
        from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
        to: iso(now),
      };
    case "lastMonth": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      return { from: iso(start), to: iso(end) };
    }
    case "90d":
      return { from: iso(daysAgo(89)), to: iso(now) };
    case "year":
      return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), to: iso(now) };
    default:
      return { from: iso(daysAgo(29)), to: iso(now) };
  }
}

// ─── Report result types ────────────────────────────────

interface ReportColumn {
  key: string;
  labelKey: string;
  type: "text" | "number" | "money" | "date" | "datetime" | "percent";
}

interface ReportResult {
  id: string;
  snapshot: boolean;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

// ─── Report row (library entry) ─────────────────────────

function ReportRow({
  id,
  snapshot,
  fav,
  onToggleFav,
  onSelect,
}: {
  id: string;
  snapshot?: boolean;
  fav: boolean;
  onToggleFav: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("admin.reportsPage");
  return (
    <div className="flex items-start gap-2 py-1.5">
      <button
        onClick={() => onToggleFav(id)}
        aria-label="favorito"
        className="mt-0.5 shrink-0 text-muted/40 transition-colors hover:text-amber-500"
      >
        <Star className={cn("h-3.5 w-3.5", fav && "fill-amber-400 text-amber-400")} />
      </button>
      <button onClick={() => onSelect(id)} className="min-w-0 text-left">
        <p className="text-sm font-semibold text-admin hover:underline">
          {t(`r.${id}.title`)}
          {snapshot && (
            <span className="ml-1.5 rounded bg-surface px-1 py-0.5 text-[9px] font-medium text-muted">
              {t("snapshotBadge")}
            </span>
          )}
        </p>
        <p className="text-xs leading-snug text-muted">{t(`r.${id}.desc`)}</p>
      </button>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────

export default function ReportsPage() {
  const t = useTranslations("admin.reportsPage");
  const locale = useLocale();
  const currency = useCurrency();

  const [preset, setPreset] = useState<Preset>("30d");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const favs = useSyncExternalStore(favsSubscribe, favsSnapshot, favsServerSnapshot);
  const toggleFav = toggleFavStored;

  const range = presetRange(preset);

  const { data: result, isLoading } = useQuery<ReportResult>({
    queryKey: ["report", selected, range.from, range.to],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/reports/${selected}?from=${range.from}&to=${range.to}`,
      );
      if (!res.ok) throw new Error("Failed to run report");
      return res.json();
    },
    enabled: !!selected,
  });

  const fmtValue = (value: unknown, type: ReportColumn["type"]): string => {
    if (value === null || value === undefined || value === "") return "—";
    switch (type) {
      case "money":
        return formatMoney(Number(value), currency);
      case "percent":
        return `${value}%`;
      case "date":
        return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value as string));
      case "datetime":
        return new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(value as string));
      case "number":
        return Number(value).toLocaleString();
      default:
        return String(value);
    }
  };

  const q = search.toLowerCase();
  const matches = (id: string) =>
    !q ||
    t(`r.${id}.title`).toLowerCase().includes(q) ||
    t(`r.${id}.desc`).toLowerCase().includes(q);

  const favReports = CATALOG.filter((r) => favs.includes(r.id) && matches(r.id));
  const categories: Category[] = ["classes", "memberships", "sales", "customers"];

  const selectedMeta = useMemo(
    () => CATALOG.find((r) => r.id === selected) ?? null,
    [selected],
  );

  // ─── Detail view ──────────────────────────────────────
  if (selected && selectedMeta) {
    const csvUrl = `/api/admin/reports/${selected}?from=${range.from}&to=${range.to}&format=csv`;
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <SectionTabs tabs={INSIGHTS_TABS} ariaLabel="Insights sections" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelected(null)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-surface hover:text-foreground"
              aria-label={t("back")}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="font-display text-xl font-bold">{t(`r.${selected}.title`)}</h1>
              <p className="text-xs text-muted">{t(`r.${selected}.desc`)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!selectedMeta.snapshot && (
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger className="h-9 w-[160px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">{t("range7d")}</SelectItem>
                  <SelectItem value="30d">{t("range30d")}</SelectItem>
                  <SelectItem value="month">{t("rangeMonth")}</SelectItem>
                  <SelectItem value="lastMonth">{t("rangeLastMonth")}</SelectItem>
                  <SelectItem value="90d">{t("range90d")}</SelectItem>
                  <SelectItem value="year">{t("rangeYear")}</SelectItem>
                </SelectContent>
              </Select>
            )}
            <a
              href={csvUrl}
              download
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
          </div>
        </div>

        {isLoading || !result ? (
          <Skeleton className="h-96 rounded-2xl" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
              <span className="text-xs text-muted">
                {t("rowCount", { count: result.rowCount })}
                {result.snapshot ? ` · ${t("snapshotNote")}` : ""}
              </span>
            </div>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
                  <tr>
                    {result.columns.map((c) => (
                      <th
                        key={c.key}
                        className={cn(
                          "whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted",
                          ["money", "number", "percent"].includes(c.type) && "text-right",
                        )}
                      >
                        {t(`col.${c.labelKey}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.length === 0 ? (
                    <tr>
                      <td colSpan={result.columns.length} className="px-4 py-10 text-center text-sm text-muted">
                        {t("empty")}
                      </td>
                    </tr>
                  ) : (
                    result.rows.map((row, i) => (
                      <tr
                        key={i}
                        className={cn(
                          "border-t border-border/30 transition-colors hover:bg-surface/40",
                        )}
                      >
                        {result.columns.map((c) => (
                          <td
                            key={c.key}
                            className={cn(
                              "whitespace-nowrap px-4 py-2 text-[13px] text-foreground/85",
                              ["money", "number", "percent"].includes(c.type) &&
                                "text-right tabular-nums",
                            )}
                          >
                            {fmtValue(row[c.key], c.type)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Library view ─────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionTabs tabs={INSIGHTS_TABS} ariaLabel="Insights sections" />

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </motion.div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-xl border border-input-border bg-card py-2 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted focus:border-foreground/30"
          />
        </div>
        <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">{t("range7d")}</SelectItem>
            <SelectItem value="30d">{t("range30d")}</SelectItem>
            <SelectItem value="month">{t("rangeMonth")}</SelectItem>
            <SelectItem value="lastMonth">{t("rangeLastMonth")}</SelectItem>
            <SelectItem value="90d">{t("range90d")}</SelectItem>
            <SelectItem value="year">{t("rangeYear")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {favReports.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {t("favorites")}
          </h2>
          <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {favReports.map((r) => (
              <ReportRow
                key={r.id}
                id={r.id}
                snapshot={r.snapshot}
                fav={favs.includes(r.id)}
                onToggleFav={toggleFav}
                onSelect={setSelected}
              />
            ))}
          </div>
        </div>
      )}

      {categories.map((cat) => {
        const reports = CATALOG.filter((r) => r.category === cat && matches(r.id));
        if (reports.length === 0) return null;
        const Icon = CATEGORY_ICONS[cat];
        return (
          <div key={cat} className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
              <Icon className="h-4 w-4 text-muted" />
              {t(`cat.${cat}`)}
            </h2>
            <p className="mb-2 text-xs text-muted">{t(`catDesc.${cat}`)}</p>
            <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {reports.map((r) => (
                <ReportRow
                  key={r.id}
                  id={r.id}
                  snapshot={r.snapshot}
                  fav={favs.includes(r.id)}
                  onToggleFav={toggleFav}
                  onSelect={setSelected}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
