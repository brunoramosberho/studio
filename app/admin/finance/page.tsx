"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
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
import { cn, formatCurrency } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";

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
  memberName: string;
  memberEmail: string;
  concept: string | null;
  conceptSub: string | null;
  conceptType: string;
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

const sourceLabels: Record<string, string> = {
  subscriptions: "Suscripciones",
  packages: "Bonos y paquetes",
  products: "Tienda",
  penalties: "Penalizaciones",
  classpass: "Plataformas externas",
};

const methodStyles: Record<string, string> = {
  stripe: "bg-blue-50 text-blue-700",
  tpv: "bg-emerald-50 text-emerald-700",
  cash: "bg-amber-50 text-amber-700",
  classpass: "bg-purple-50 text-purple-700",
  gympass: "bg-purple-50 text-purple-700",
};

const methodLabels: Record<string, string> = {
  stripe: "Stripe",
  tpv: "TPV banco",
  cash: "Efectivo",
  classpass: "ClassPass",
  gympass: "Gympass",
};

const conceptTypeStyles: Record<string, string> = {
  subscription: "bg-stone-100 text-stone-600",
  package: "bg-blue-50 text-blue-700",
  product: "bg-emerald-50 text-emerald-700",
  penalty: "bg-red-50 text-red-700",
};

const conceptTypeLabels: Record<string, string> = {
  subscription: "Suscripción",
  package: "Bono / Paquete",
  product: "Producto",
  penalty: "Penalización",
};

const periods = [
  { value: "today", label: "Hoy" },
  { value: "month", label: "Este mes" },
  { value: "last30", label: "Últimos 30 días" },
  { value: "last90", label: "Últimos 90 días" },
  { value: "year", label: "Este año" },
] as const;

const methodFilters = [
  { value: "all", label: "Todos" },
  { value: "stripe", label: "Stripe" },
  { value: "tpv", label: "TPV" },
  { value: "cash", label: "Efectivo" },
  { value: "failed", label: "Fallidos" },
] as const;

// ── Helpers ──

function formatTransactionDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return `Hoy ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Ayer ${format(d, "HH:mm")}`;
  return format(d, "d MMM", { locale: es });
}

function formatAvailableOn(dateStr: string | null, source: string) {
  if (!dateStr) {
    if (source === "cash") return "En el momento";
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
  const [range, setRange] = useState<string>("month");
  const [method, setMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
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
  const tx = txData?.transactions ?? [];
  const pagination = txData?.pagination;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Finanzas</h1>
          <p className="mt-1 text-sm text-stone-400">
            Resumen financiero del studio
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => { setRange(e.target.value); setPage(1); }}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 outline-none focus:border-stone-400"
          >
            {periods.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {financeLd ? (
          Array.from({ length: 4 }).map((_, i) => (
            <motion.div key={i} variants={fadeUp}>
              <Skeleton className="h-[120px] rounded-2xl" />
            </motion.div>
          ))
        ) : (
          <>
            {/* Gross Revenue */}
            <motion.div variants={fadeUp}>
              <div className="bg-white border border-stone-100 rounded-2xl p-4">
                <p className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Ingresos brutos
                </p>
                <p className="text-[22px] font-medium leading-none">
                  {formatCurrency(summary?.grossRevenue ?? 0)}
                </p>
                <p className="text-[11px] text-stone-400 mt-1">
                  Fees de Stripe en dashboard.stripe.com
                </p>
                <TrendBadge value={summary?.vsPreviousPeriod.grossRevenue ?? 0} label="vs período anterior" />
              </div>
            </motion.div>

            {/* MRR */}
            <motion.div variants={fadeUp}>
              <div className="bg-white border border-stone-100 rounded-2xl p-4">
                <p className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> MRR activo
                </p>
                <p className="text-[22px] font-medium leading-none text-[#3730B8]">
                  {formatCurrency(summary?.mrr ?? 0)}
                </p>
                <p className="text-[11px] text-stone-400 mt-1">
                  {summary?.activeMemberships ?? 0} membresías activas
                </p>
                <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  +{summary?.newMembershipsThisMonth ?? 0} nuevas este mes
                </p>
              </div>
            </motion.div>

            {/* Failed Payments */}
            <motion.div variants={fadeUp}>
              <div className="bg-white border border-stone-100 rounded-2xl p-4">
                <p className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Pagos fallidos
                </p>
                <p className={cn(
                  "text-[22px] font-medium leading-none",
                  (summary?.failedPaymentsCount ?? 0) > 0 ? "text-red-700" : "",
                )}>
                  {formatCurrency(summary?.failedPaymentsAmount ?? 0)}
                </p>
                <p className="text-[11px] text-stone-400 mt-1">
                  {summary?.failedPaymentsCount ?? 0} tarjetas rechazadas
                </p>
                {(summary?.failedPaymentsCount ?? 0) > 0 ? (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Requieren acción
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Sin pagos fallidos
                  </p>
                )}
              </div>
            </motion.div>

            {/* Upcoming Renewals */}
            <motion.div variants={fadeUp}>
              <div className="bg-white border border-stone-100 rounded-2xl p-4">
                <p className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Próximos cobros
                </p>
                <p className="text-[22px] font-medium leading-none">
                  {formatCurrency(summary?.upcomingRenewalsAmount ?? 0)}
                </p>
                <p className="text-[11px] text-stone-400 mt-1">
                  {summary?.upcomingRenewalsCount ?? 0} renovaciones esta semana
                </p>
                <p className="text-[11px] text-stone-400 mt-1 flex items-center gap-1">
                  Próximos 7 días
                </p>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Daily Revenue Bar Chart */}
        <div className="lg:col-span-2 bg-white border border-stone-100 rounded-2xl p-4">
          <p className="text-xs font-medium text-stone-600 mb-3">Ingresos diarios</p>
          {financeLd ? (
            <Skeleton className="h-[100px]" />
          ) : (
            <DailyRevenueChart data={finance?.dailyRevenue ?? []} />
          )}
        </div>

        {/* Source Breakdown */}
        <div className="bg-white border border-stone-100 rounded-2xl p-4">
          <p className="text-xs font-medium text-stone-600 mb-3">Desglose por fuente</p>
          {financeLd ? (
            <Skeleton className="h-[100px]" />
          ) : (
            <SourceBreakdown sources={finance?.bySource ?? []} />
          )}
        </div>
      </div>

      {/* Alerts */}
      {!financeLd && (summary?.failedPaymentsCount ?? 0) > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-red-700 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                {summary!.failedPaymentsCount} pagos fallidos — {formatCurrency(summary!.failedPaymentsAmount)} pendientes
              </p>
              <p className="text-xs text-red-700 mt-1">
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
              Notificar
            </button>
          </div>
        </motion.div>
      )}

      {!financeLd && (summary?.upcomingRenewalsCount ?? 0) > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
            <Clock className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                {summary!.upcomingRenewalsCount} renovaciones esta semana — {formatCurrency(summary!.upcomingRenewalsAmount)}
              </p>
            </div>
            <button
              onClick={() => renewalsRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="text-xs font-medium px-2.5 py-1.5 bg-amber-200 text-amber-900 rounded-lg hover:bg-amber-300 flex-shrink-0"
            >
              Ver todas
            </button>
          </div>
        </motion.div>
      )}

      {/* Transactions Table */}
      <div className="bg-white border border-stone-100 rounded-2xl overflow-hidden">
        {/* Search & Filters */}
        <div className="px-4 py-3 border-b border-stone-50 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, monto o método..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-stone-400 placeholder:text-stone-300"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {methodFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => { setMethod(f.value); setPage(1); }}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  method === f.value
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-500 hover:bg-stone-200",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left">Cliente</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left">Concepto</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left">Método</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-right">Monto</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left hidden lg:table-cell">Fee / Neto</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left hidden xl:table-cell">Llega al banco</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-center">Estado</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-left hidden lg:table-cell">Cobrado por</th>
                <th className="text-[10px] uppercase tracking-wider text-stone-400 px-4 py-2.5 text-right">Fecha</th>
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
                    Sin transacciones en este período
                  </td>
                </tr>
              ) : (
                tx.map((t) => (
                  <tr key={t.id} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                    {/* Client */}
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-medium text-stone-700 truncate max-w-[140px]">{t.memberName}</p>
                      <p className="text-[10px] text-stone-400 truncate max-w-[140px]">{t.memberEmail}</p>
                    </td>
                    {/* Concept */}
                    <td className="px-4 py-2.5">
                      <p className="text-xs text-stone-600 truncate max-w-[150px]">{t.concept ?? t.conceptSub ?? "—"}</p>
                      <span className={cn("inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium", conceptTypeStyles[t.conceptType] ?? "bg-stone-100 text-stone-500")}>
                        {conceptTypeLabels[t.conceptType] ?? t.conceptType}
                      </span>
                    </td>
                    {/* Method */}
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-medium", methodStyles[t.source] ?? "bg-stone-100 text-stone-500")}>
                        {methodLabels[t.source] ?? t.source}
                      </span>
                    </td>
                    {/* Amount */}
                    <td className="px-4 py-2.5 text-right">
                      <p className="text-xs font-medium text-stone-700">{formatCurrency(t.grossAmount)}</p>
                    </td>
                    {/* Fee / Net */}
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <FeeNetCell transaction={t} />
                    </td>
                    {/* Available On */}
                    <td className="px-4 py-2.5 hidden xl:table-cell">
                      <p className="text-[10px] text-stone-400">
                        {formatAvailableOn(t.availableOn, t.source)}
                      </p>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-2.5 text-center">
                      <StatusBadge status={t.status} />
                    </td>
                    {/* Processed By */}
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <ProcessedByCell transaction={t} />
                    </td>
                    {/* Date */}
                    <td className="px-4 py-2.5 text-right">
                      <p className="text-[10px] text-stone-400">{formatTransactionDate(t.createdAt)}</p>
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
              Mostrando {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} transacciones
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
          <h2 className="font-display text-lg font-bold mb-3">Próximas renovaciones</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {finance.upcomingRenewals.map((r) => {
              const dayLabel = formatRenewalDay(r.date);
              const grouped = groupMemberships(r.memberships);
              return (
                <div key={r.date} className="bg-white border border-stone-100 rounded-xl p-3">
                  <p className="text-[10px] text-stone-400">{dayLabel} · {r.count} cobros</p>
                  <p className="text-sm font-medium text-stone-900">Renovaciones de membresía</p>
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

function DailyRevenueChart({ data }: { data: DailyRevenue[] }) {
  if (data.length === 0) return <p className="text-xs text-stone-400">Sin datos</p>;

  const maxAmount = Math.max(...data.map((d) => d.amount), 1);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-end gap-[2px] h-[80px]">
      {data.map((d) => {
        const height = Math.max((d.amount / maxAmount) * 72, 2);
        const isCurrentDay = d.date === todayStr;
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
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block">
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

function SourceBreakdown({ sources }: { sources: BySource[] }) {
  const filtered = sources.filter((s) => s.amount > 0);
  if (filtered.length === 0) return <p className="text-xs text-stone-400">Sin datos</p>;

  return (
    <div className="space-y-2.5">
      {filtered.map((s) => (
        <div key={s.source} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sourceColors[s.source] ?? "#999" }} />
          <span className="text-xs text-stone-600 flex-1">{sourceLabels[s.source] ?? s.source}</span>
          <span className="text-xs font-medium text-stone-700">{formatCurrency(s.amount)}</span>
          <span className="text-[10px] text-stone-400 w-8 text-right">{s.percent}%</span>
        </div>
      ))}
    </div>
  );
}

function FeeNetCell({ transaction: t }: { transaction: Transaction }) {
  if (t.source === "cash") {
    return <span className="text-[10px] text-stone-400">Sin fee</span>;
  }
  if (t.fee == null) {
    return <span className="text-[10px] text-stone-400">—</span>;
  }
  const prefix = t.isFeesEstimated ? "~" : "";
  return (
    <div className="text-[10px] text-stone-400" title={t.isFeesEstimated ? "Estimado según config TPV" : undefined}>
      <span>{prefix}{formatCurrency(t.fee)} fee</span>
      <span className="mx-0.5">·</span>
      <span>{prefix}{formatCurrency(t.netAmount ?? 0)} neto</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "succeeded") {
    return <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-medium">✓ Cobrado</span>;
  }
  if (status === "failed") {
    return <span className="inline-flex items-center gap-0.5 text-[10px] text-red-700 font-medium">✗ Fallido</span>;
  }
  if (status === "refunded") {
    return <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-500 font-medium">↩ Reembolsado</span>;
  }
  return <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 font-medium">● Pendiente</span>;
}

function ProcessedByCell({ transaction: t }: { transaction: Transaction }) {
  if (t.processedByType === "system" || !t.processedBy) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center">
          <Zap className="w-3 h-3 text-stone-400" />
        </div>
        <span className="text-xs text-stone-400">Sistema</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium text-white"
        style={{ backgroundColor: t.processedBy.avatarColor }}
      >
        {t.processedBy.initials}
      </div>
      <span className="text-xs text-stone-600">{t.processedBy.name}</span>
    </div>
  );
}

function formatRenewalDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  if (isToday(d)) return "Hoy";
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
