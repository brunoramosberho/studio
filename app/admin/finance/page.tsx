"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Zap,
  CreditCard,
  Banknote,
  Bell,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFormatMoney } from "@/components/tenant-provider";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { FinanceBriefingCard } from "@/components/admin/MgicAI/FinanceBriefingCard";
import { SectionTabs } from "@/components/admin/section-tabs";
import { FINANCE_TABS } from "@/components/admin/section-tab-configs";

// ── Types ──

interface FinanceSummary {
  grossRevenue: number;
  mrr: number;
  activeMemberships: number;
  newMembershipsThisMonth: number;
  failedPaymentsAmount: number;
  failedPaymentsCount: number;
  upcomingRenewalsAmount: number;
  upcomingRenewalsCount: number;
  vsPreviousPeriod: { grossRevenue: number; mrr: number };
}

interface BySource {
  source: string;
  amount: number;
  percent: number;
}

interface DailyRevenue {
  date: string;
  amount: number;
}

interface FailedPayment {
  memberId: string | null;
  memberName: string;
  memberEmail: string;
  amount: number;
  failedAt: string;
}

interface UpcomingRenewal {
  date: string;
  count: number;
  totalAmount: number;
  memberships: { memberName: string; membershipName: string; amount: number }[];
}

interface FinanceData {
  summary: FinanceSummary;
  bySource: BySource[];
  dailyRevenue: DailyRevenue[];
  failedPayments: FailedPayment[];
  upcomingRenewals: UpcomingRenewal[];
}

interface Transaction {
  id: string;
  source: string;
  memberId: string | null;
  memberName: string;
  memberEmail: string;
  concept: string | null;
  conceptSub: string | null;
  conceptType: string;
  itemName: string | null;
  itemHref: string | null;
  grossAmount: number;
  fee: number | null;
  netAmount: number | null;
  availableOn: string | null;
  isFeesEstimated: boolean;
  status: string;
  processedBy: { id: string; name: string; initials: string; avatarColor: string } | null;
  processedByType: string;
  createdAt: string;
}

interface TransactionsResponse {
  transactions: Transaction[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ── Constants ──

const sourceColors: Record<string, string> = {
  subscriptions: "#1C2340",
  packages: "#378ADD",
  products: "#1D9E75",
  penalties: "#E24B4A",
  classpass: "#7F77DD",
};

const sourceLabelKeys: Record<string, string> = {
  subscriptions: "subscriptionsLabel",
  packages: "packagesLabel",
  products: "productsLabel",
  penalties: "penalties",
  classpass: "externalPlatforms",
};

const methodStyles: Record<string, string> = {
  stripe: "bg-blue-50 text-blue-700",
  tpv: "bg-emerald-50 text-emerald-700",
  cash: "bg-amber-50 text-amber-700",
  classpass: "bg-purple-50 text-purple-700",
  gympass: "bg-purple-50 text-purple-700",
};

const methodLabelKeys: Record<string, string> = {
  stripe: "stripe",
  tpv: "tpv",
  cash: "cash",
  classpass: "externalPlatforms",
  gympass: "gympass",
};

const conceptTypeStyles: Record<string, string> = {
  subscription: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  package: "bg-stone-100 text-stone-500",
  product: "bg-emerald-50 text-emerald-700",
  penalty: "bg-red-50 text-red-700",
};

const conceptTypeLabelKeys: Record<string, string> = {
  subscription: "subscription",
  package: "packageLabel",
  product: "productLabel",
  penalty: "penalty",
};

const periods = [
  { value: "today", labelKey: "periodToday" },
  { value: "month", labelKey: "periodMonth" },
  { value: "last30", labelKey: "periodLast30" },
  { value: "last90", labelKey: "periodLast90" },
  { value: "year", labelKey: "periodYear" },
] as const;

const methodFilters = [
  { value: "all", labelKey: "methodAll" },
  { value: "stripe", labelKey: "methodStripe" },
  { value: "tpv", labelKey: "methodTpv" },
  { value: "cash", labelKey: "methodCash" },
  { value: "failed", labelKey: "methodFailed" },
] as const;

// ── Helpers ──

function formatTransactionDate(dateStr: string, t: (key: string) => string) {
  const d = new Date(dateStr);
  if (isToday(d)) return `${t("todayDate")} ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `${t("yesterdayDate")} ${format(d, "HH:mm")}`;
  return format(d, "d MMM", { locale: es });
}

function formatAvailableOn(dateStr: string | null, source: string, t: (key: string) => string) {
  if (!dateStr) {
    if (source === "cash") return t("atTheMoment");
    return "—";
  }
  const d = new Date(dateStr);
  const label = format(d, "EEE d MMM", { locale: es });
  return source === "tpv" ? `~${label}` : label;
}

// ── Animations ──

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ── Component ──

export default function FinancePage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const formatCurrency = useFormatMoney();
  const [range, setRange] = useState<string>("month");
  const [method, setMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hideAbandoned, setHideAbandoned] = useState(true);
  const renewalsRef = useRef<HTMLDivElement>(null);

  const { data: finance, isLoading: financeLd } = useQuery<FinanceData>({
    queryKey: ["admin-finance", range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finance?range=${range}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: txData, isLoading: txLd } = useQuery<TransactionsResponse>({
    queryKey: ["admin-finance-tx", range, method, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ range, method, search, page: String(page), limit: "25" });
      const res = await fetch(`/api/admin/finance/transactions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const handleExport = useCallback(async () => {
    const res = await fetch(`/api/admin/finance/export?range=${range}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finanzas-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [range]);

  const summary = finance?.summary;
  const allTx = txData?.transactions ?? [];
  const tx = hideAbandoned
    ? allTx.filter((txn) => {
        if (txn.status !== "pending") return true;
        return Date.now() - new Date(txn.createdAt).getTime() < 60 * 60 * 1000;
      })
    : allTx;
  const pagination = txData?.pagination;

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
      <SectionTabs tabs={FINANCE_TABS} ariaLabel="Finance sections" />
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("financeTitle")}</h1>
          <p className="mt-1 text-sm text-stone-400">
            {t("financeSummary")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => { setRange(e.target.value); setPage(1); }}
            className="rounded-lg border border-stone-200 bg-card px-3 py-1.5 text-sm text-stone-700 outline-none focus:border-stone-400"
          >
            {periods.map((p) => (
              <option key={p.value} value={p.value}>{t(p.labelKey)}</option>
            ))}
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-card px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            <Download className="h-3.5 w-3.5" />
            {t("exportCsv")}
          </button>
        </div>
      </motion.div>

      {/* Spark CFO Briefing */}
      <FinanceBriefingCard range={range} />

      {/* Summary Cards */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {financeLd ? (
          Array.from({ length: 4 }).map((_, i) => (
            <motion.div key={i} variants={fadeUp}>
              <Skeleton className="h-[108px] sm:h-[120px] rounded-2xl" />
            </motion.div>
          ))
        ) : (
          <>
            {/* Gross Revenue */}
            <motion.div variants={fadeUp}>
              <div className="bg-card border border-stone-100 rounded-2xl p-3 sm:p-4 min-w-0">
                <p className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                  <DollarSign className="h-3 w-3 shrink-0" /> <span className="truncate">{t("grossRevenue")}</span>
                </p>
                <p className="text-[18px] sm:text-[22px] font-medium leading-tight truncate">
                  {formatCurrency(summary?.grossRevenue ?? 0)}
                </p>
                <p className="text-[11px] text-stone-400 mt-1 truncate">
                  {t("stripeFeesDashboard")}
                </p>
                <TrendBadge value={summary?.vsPreviousPeriod.grossRevenue ?? 0} label={t("vsPrevPeriod")} />
              </div>
            </motion.div>

            {/* MRR */}
            <motion.div variants={fadeUp}>
              <div className="bg-card border border-stone-100 rounded-2xl p-3 sm:p-4 min-w-0">
                <p className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 shrink-0" /> <span className="truncate">{t("mrrActive")}</span>
                </p>
                <p className="text-[18px] sm:text-[22px] font-medium leading-tight text-[#3730B8] truncate">
                  {formatCurrency(summary?.mrr ?? 0)}
                </p>
                <p className="text-[11px] text-stone-400 mt-1 truncate">
                  {summary?.activeMemberships ?? 0} {t("activeMembershipsCount")}
                </p>
                <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 shrink-0" />
                  <span className="truncate">+{summary?.newMembershipsThisMonth ?? 0} {t("newThisMonth")}</span>
                </p>
              </div>
            </motion.div>

            {/* Failed Payments */}
            <motion.div variants={fadeUp}>
              <div className="bg-card border border-stone-100 rounded-2xl p-3 sm:p-4 min-w-0">
                <p className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> <span className="truncate">{t("failedPayments")}</span>
                </p>
                <p className={cn(
                  "text-[18px] sm:text-[22px] font-medium leading-tight truncate",
                  (summary?.failedPaymentsCount ?? 0) > 0 ? "text-red-700" : "",
                )}>
                  {formatCurrency(summary?.failedPaymentsAmount ?? 0)}
                </p>
                <p className="text-[11px] text-stone-400 mt-1 truncate">
                  {summary?.failedPaymentsCount ?? 0} {t("declinedCards")}
                </p>
                {(summary?.failedPaymentsCount ?? 0) > 0 ? (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> <span className="truncate">{t("requireAction")}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 shrink-0" /> <span className="truncate">{t("noFailedPaymentsMsg")}</span>
                  </p>
                )}
              </div>
            </motion.div>

            {/* Upcoming Renewals */}
            <motion.div variants={fadeUp}>
              <div className="bg-card border border-stone-100 rounded-2xl p-3 sm:p-4 min-w-0">
                <p className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" /> <span className="truncate">{t("upcomingCharges")}</span>
                </p>
                <p className="text-[18px] sm:text-[22px] font-medium leading-tight truncate">
                  {formatCurrency(summary?.upcomingRenewalsAmount ?? 0)}
                </p>
                <p className="text-[11px] text-stone-400 mt-1 truncate">
                  {summary?.upcomingRenewalsCount ?? 0} {t("renewalsCount")}
                </p>
                <p className="text-[11px] text-stone-400 mt-1 truncate">
                  {t("next7Days")}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Charts Row */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        {/* Daily Revenue Bar Chart */}
        <div className="lg:col-span-2 bg-card border border-stone-100 rounded-2xl p-3 sm:p-4">
          <p className="text-xs font-medium text-stone-600 mb-3">{t("dailyRevenue")}</p>
          {financeLd ? (
            <Skeleton className="h-[100px]" />
          ) : (
            <DailyRevenueChart data={finance?.dailyRevenue ?? []} t={t} />
          )}
        </div>

        {/* Source Breakdown */}
        <div className="bg-card border border-stone-100 rounded-2xl p-3 sm:p-4">
          <p className="text-xs font-medium text-stone-600 mb-3">{t("sourceBreakdown")}</p>
          {financeLd ? (
            <Skeleton className="h-[100px]" />
          ) : (
            <SourceBreakdown sources={finance?.bySource ?? []} t={t} />
          )}
        </div>
      </div>

      {/* Alerts */}
      {!financeLd && (summary?.failedPaymentsCount ?? 0) > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5 sm:gap-3">
            <AlertTriangle className="h-4 w-4 text-red-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-900">
                {summary!.failedPaymentsCount} {t("failedPayments").toLowerCase()} — {formatCurrency(summary!.failedPaymentsAmount)} {t("pendingAmount")}
              </p>
              <p className="text-xs text-red-700 mt-1 break-words">
                {finance!.failedPayments
                  .slice(0, 3)
                  .map((p) => `${p.memberName} (${formatCurrency(p.amount)})`)
                  .join(" · ")}
              </p>
            </div>
            <button
              onClick={() => {
                fetch("/api/admin/finance/notify-failed", { method: "POST" });
              }}
              className="text-xs font-medium px-2.5 py-1.5 bg-red-200 text-red-900 rounded-lg hover:bg-red-300 flex-shrink-0"
            >
              <Bell className="h-3 w-3 inline mr-1" />
              {t("notify")}
            </button>
          </div>
        </motion.div>
      )}

      {!financeLd && (summary?.upcomingRenewalsCount ?? 0) > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 sm:gap-3">
            <Clock className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">
                {summary!.upcomingRenewalsCount} {t("renewalsThisWeek")} — {formatCurrency(summary!.upcomingRenewalsAmount)}
              </p>
            </div>
            <button
              onClick={() => renewalsRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="text-xs font-medium px-2.5 py-1.5 bg-amber-200 text-amber-900 rounded-lg hover:bg-amber-300 flex-shrink-0"
            >
              {t("viewAll")}
            </button>
          </div>
        </motion.div>
      )}

      {/* Transactions Table */}
      <div className="bg-card border border-stone-100 rounded-2xl overflow-hidden">
        {/* Search & Filters */}
        <div className="px-3 py-3 sm:px-4 border-b border-stone-50 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
            <input
              type="text"
              placeholder={t("searchTransactions")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-stone-400 placeholder:text-stone-300"
            />
          </div>
          {/* Filter pills: horizontal scroll on mobile, wrap on larger screens */}
          <div className="-mx-3 sm:mx-0 overflow-x-auto sm:overflow-visible">
            <div className="flex gap-1 items-center px-3 sm:px-0 sm:flex-wrap min-w-min">
              {methodFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setMethod(f.value); setPage(1); }}
                  className={cn(
                    "shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                    method === f.value
                      ? "bg-stone-900 text-white"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200",
                  )}
                >
                  {t(f.labelKey)}
                </button>
              ))}
              <label className="ml-1 sm:ml-2 flex shrink-0 items-center gap-1.5 text-xs text-stone-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideAbandoned}
                  onChange={(e) => setHideAbandoned(e.target.checked)}
                  className="rounded border-stone-300 text-stone-600 focus:ring-stone-400 h-3 w-3"
                />
                {t("hideAbandoned")}
              </label>
            </div>
          </div>
        </div>

        {/* Mobile card list (below md) */}
        <div className="md:hidden">
          {txLd ? (
            <div className="divide-y divide-stone-50">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-3 py-3">
                  <Skeleton className="h-12" />
                </div>
              ))}
            </div>
          ) : tx.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-stone-400">
              {t("noTransactionsInPeriod")}
            </div>
          ) : (
            <div className="divide-y divide-stone-50">
              {tx.map((txn) => (
                <MobileTxCard key={txn.id} txn={txn} t={t} />
              ))}
            </div>
          )}
        </div>

        {/* Desktop table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left">{t("clientColumn")}</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left">{t("conceptColumn")}</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left">{t("methodColumn")}</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-right">{t("amountColumn")}</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left hidden lg:table-cell">{t("feeNetColumn")}</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left hidden xl:table-cell">{t("arrivesBankColumn")}</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-center">{t("statusColumn")}</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left hidden lg:table-cell">{t("processedByColumn")}</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-right">{t("dateColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {txLd ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4 py-3"><Skeleton className="h-4" /></td>
                  </tr>
                ))
              ) : tx.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-stone-400">
                    {t("noTransactionsInPeriod")}
                  </td>
                </tr>
              ) : (
                tx.map((txn) => (
                  <tr key={txn.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                    {/* Client */}
                    <td className="px-4 py-2.5">
                      {txn.memberId ? (
                        <Link href={`/admin/clients/${txn.memberId}`} className="group block">
                          <p className="text-xs font-medium text-stone-700 truncate max-w-[140px] group-hover:text-stone-900 group-hover:underline">{txn.memberName}</p>
                          <p className="text-[10px] text-stone-400 truncate max-w-[140px]">{txn.memberEmail}</p>
                        </Link>
                      ) : (
                        <div>
                          <p className="text-xs font-medium text-stone-700 truncate max-w-[140px]">{txn.memberName}</p>
                          <p className="text-[10px] text-stone-400 truncate max-w-[140px]">{txn.memberEmail}</p>
                        </div>
                      )}
                    </td>
                    {/* Concept */}
                    <td className="px-4 py-2.5">
                      {txn.itemName && txn.itemHref ? (
                        <Link href={txn.itemHref} className="text-xs font-medium text-stone-700 hover:text-stone-900 hover:underline truncate block max-w-[170px]">
                          {txn.itemName}
                        </Link>
                      ) : (
                        <p className="text-xs font-medium text-stone-600 truncate max-w-[170px]">{txn.concept ?? "—"}</p>
                      )}
                      <p className="text-[10px] text-stone-400 truncate max-w-[170px]">{txn.conceptSub}</p>
                      <span className={cn("inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium", conceptTypeStyles[txn.conceptType] ?? "bg-stone-100 text-stone-500")}>
                        {conceptTypeLabelKeys[txn.conceptType] ? t(conceptTypeLabelKeys[txn.conceptType]) : txn.conceptType}
                      </span>
                    </td>
                    {/* Method */}
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-medium", methodStyles[txn.source] ?? "bg-stone-100 text-stone-500")}>
                        {methodLabelKeys[txn.source] ? t(methodLabelKeys[txn.source]) : txn.source}
                      </span>
                    </td>
                    {/* Amount */}
                    <td className="px-4 py-2.5 text-right">
                      <p className="text-xs font-medium text-stone-700">{formatCurrency(txn.grossAmount)}</p>
                    </td>
                    {/* Fee / Net */}
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <FeeNetCell transaction={txn} t={t} />
                    </td>
                    {/* Available On */}
                    <td className="px-4 py-2.5 hidden xl:table-cell">
                      <p className="text-[10px] text-stone-400">
                        {formatAvailableOn(txn.availableOn, txn.source, t)}
                      </p>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-2.5 text-center">
                      <StatusBadge status={txn.status} createdAt={txn.createdAt} t={t} />
                    </td>
                    {/* Processed By */}
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <ProcessedByCell transaction={txn} t={t} />
                    </td>
                    {/* Date */}
                    <td className="px-4 py-2.5 text-right">
                      <p className="text-[10px] text-stone-400">{formatTransactionDate(txn.createdAt, t)}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-stone-50 flex items-center justify-between">
            <p className="text-[10px] text-stone-400">
              {t("showingPagination", { from: ((pagination.page - 1) * pagination.limit) + 1, to: Math.min(pagination.page * pagination.limit, pagination.total), total: pagination.total })}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded-lg text-stone-400 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-stone-500 px-2">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="p-1 rounded-lg text-stone-400 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upcoming Renewals */}
      {!financeLd && finance?.upcomingRenewals && finance.upcomingRenewals.length > 0 && (
        <div ref={renewalsRef}>
          <h2 className="font-display text-lg font-bold mb-3">{t("upcomingRenewalsTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {finance.upcomingRenewals.map((r) => {
              const dayLabel = formatRenewalDay(r.date, t);
              const grouped = groupMemberships(r.memberships);
              return (
                <div key={r.date} className="bg-card border border-stone-100 rounded-xl p-3">
                  <p className="text-[10px] text-stone-400">{dayLabel} · {r.count} {t("chargesCount")}</p>
                  <p className="text-sm font-medium text-stone-900">{t("membershipRenewals")}</p>
                  <p className="text-[13px] font-medium text-[#3730B8] mt-1">{formatCurrency(r.totalAmount)}</p>
                  <p className="text-[10px] text-stone-400">{grouped}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function TrendBadge({ value, label }: { value: number; label: string }) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <p className={cn("text-[11px] mt-1 flex items-center gap-1", positive ? "text-emerald-600" : "text-red-600")}>
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}{value}% {label}
    </p>
  );
}

function DailyRevenueChart({ data, t }: { data: DailyRevenue[]; t: (key: string) => string }) {
  const formatCurrency = useFormatMoney();
  if (data.length === 0) return <p className="text-xs text-stone-400">{t("noData")}</p>;

  const maxAmount = Math.max(...data.map((d) => d.amount), 1);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-end gap-[2px] h-[80px]">
      {data.map((d, i) => {
        const height = Math.max((d.amount / maxAmount) * 72, 2);
        const isCurrentDay = d.date === todayStr;
        // Anchor tooltip to edges when near the start/end to avoid overflow
        const isFirstThird = i < data.length / 3;
        const isLastThird = i >= (data.length * 2) / 3;
        return (
          <div
            key={d.date}
            className="group relative flex-1 min-w-0"
          >
            <div
              className={cn(
                "w-full rounded-t-sm transition-colors",
                isCurrentDay ? "bg-[#1C2340]" : "bg-stone-200 hover:bg-stone-300",
              )}
              style={{ height: `${height}px` }}
            />
            <div
              className={cn(
                "absolute bottom-full mb-1 hidden group-hover:block z-10",
                isFirstThird
                  ? "left-0"
                  : isLastThird
                    ? "right-0"
                    : "left-1/2 -translate-x-1/2",
              )}
            >
              <div className="bg-stone-900 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                {d.date.slice(8, 10)}/{d.date.slice(5, 7)} · {formatCurrency(d.amount)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SourceBreakdown({ sources, t }: { sources: BySource[]; t: (key: string) => string }) {
  const formatCurrency = useFormatMoney();
  const filtered = sources.filter((s) => s.amount > 0);
  if (filtered.length === 0) return <p className="text-xs text-stone-400">{t("noData")}</p>;

  return (
    <div className="space-y-2.5">
      {filtered.map((s) => (
        <div key={s.source} className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sourceColors[s.source] ?? "#999" }} />
          <span className="text-xs text-stone-600 flex-1 truncate">{sourceLabelKeys[s.source] ? t(sourceLabelKeys[s.source]) : s.source}</span>
          <span className="text-xs font-medium text-stone-700 shrink-0">{formatCurrency(s.amount)}</span>
          <span className="text-[10px] text-stone-400 w-8 text-right shrink-0">{s.percent}%</span>
        </div>
      ))}
    </div>
  );
}

function FeeNetCell({ transaction: txn, t }: { transaction: Transaction; t: (key: string) => string }) {
  const formatCurrency = useFormatMoney();
  if (txn.source === "cash") {
    return <span className="text-[10px] text-stone-400">{t("noFee")}</span>;
  }
  if (txn.fee == null) {
    return <span className="text-[10px] text-stone-400">—</span>;
  }
  const prefix = txn.isFeesEstimated ? "~" : "";
  return (
    <div className="text-[10px] text-stone-400" title={txn.isFeesEstimated ? t("estimated") : undefined}>
      <span>{prefix}{formatCurrency(txn.fee)} {t("fee")}</span>
      <span className="mx-0.5">·</span>
      <span>{prefix}{formatCurrency(txn.netAmount ?? 0)} {t("net")}</span>
    </div>
  );
}

function StatusBadge({ status, createdAt, t }: { status: string; createdAt: string; t: (key: string) => string }) {
  if (status === "succeeded") {
    return <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-medium">✓ {t("statusSucceeded")}</span>;
  }
  if (status === "failed") {
    return <span className="inline-flex items-center gap-0.5 text-[10px] text-red-700 font-medium">✗ {t("statusFailed")}</span>;
  }
  if (status === "refunded") {
    return <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-500 font-medium">↩ {t("statusRefunded")}</span>;
  }
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const isAbandoned = ageMs > 60 * 60 * 1000;
  if (isAbandoned) {
    return <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-400 font-medium">○ {t("statusAbandoned")}</span>;
  }
  return <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 font-medium">● {t("statusPending")}</span>;
}

function ProcessedByCell({ transaction: txn, t }: { transaction: Transaction; t: (key: string) => string }) {
  if (txn.processedByType === "system" || !txn.processedBy) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center">
          <Zap className="w-3 h-3 text-stone-400" />
        </div>
        <span className="text-xs text-stone-400">{t("systemLabel")}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium text-white"
        style={{ backgroundColor: txn.processedBy.avatarColor }}
      >
        {txn.processedBy.initials}
      </div>
      <span className="text-xs text-stone-600">{txn.processedBy.name}</span>
    </div>
  );
}

function formatRenewalDay(dateStr: string, t: (key: string) => string) {
  const d = new Date(dateStr + "T00:00:00");
  if (isToday(d)) return t("todayDate");
  return format(d, "EEEE d MMM", { locale: es });
}

function groupMemberships(memberships: { memberName: string; membershipName: string; amount: number }[]) {
  const counts: Record<string, number> = {};
  for (const m of memberships) {
    counts[m.membershipName] = (counts[m.membershipName] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => `${count} × ${name}`)
    .join(" · ");
}

function MobileTxCard({ txn, t }: { txn: Transaction; t: (key: string) => string }) {
  const formatCurrency = useFormatMoney();
  const clientInner = (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-stone-800 truncate">{txn.memberName}</p>
      <p className="text-[11px] text-stone-400 truncate">{txn.memberEmail}</p>
    </div>
  );

  return (
    <div className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        {txn.memberId ? (
          <Link href={`/admin/clients/${txn.memberId}`} className="min-w-0 flex-1 hover:underline">
            {clientInner}
          </Link>
        ) : (
          clientInner
        )}
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-stone-900">{formatCurrency(txn.grossAmount)}</p>
          <p className="text-[10px] text-stone-400 mt-0.5">{formatTransactionDate(txn.createdAt, t)}</p>
        </div>
      </div>

      {/* Concept */}
      <div className="mt-2">
        {txn.itemName && txn.itemHref ? (
          <Link href={txn.itemHref} className="text-[12px] font-medium text-stone-700 hover:underline truncate block">
            {txn.itemName}
          </Link>
        ) : (
          <p className="text-[12px] font-medium text-stone-600 truncate">{txn.concept ?? "—"}</p>
        )}
        {txn.conceptSub ? (
          <p className="text-[10px] text-stone-400 truncate">{txn.conceptSub}</p>
        ) : null}
      </div>

      {/* Meta row: badges + status */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className={cn("inline-block px-1.5 py-0.5 rounded text-[9px] font-medium", conceptTypeStyles[txn.conceptType] ?? "bg-stone-100 text-stone-500")}>
          {conceptTypeLabelKeys[txn.conceptType] ? t(conceptTypeLabelKeys[txn.conceptType]) : txn.conceptType}
        </span>
        <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-medium", methodStyles[txn.source] ?? "bg-stone-100 text-stone-500")}>
          {methodLabelKeys[txn.source] ? t(methodLabelKeys[txn.source]) : txn.source}
        </span>
        <span className="ml-auto">
          <StatusBadge status={txn.status} createdAt={txn.createdAt} t={t} />
        </span>
      </div>
    </div>
  );
}
