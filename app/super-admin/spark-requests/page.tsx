"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sparkles,
  CheckCircle,
  Circle,
  Filter,
  Building2,
  User,
  Clock,
  Zap,
  Search,
  BarChart3,
  Link2,
  FileText,
  Bot,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface FeatureRequest {
  id: string;
  tenantId: string;
  adminUserId: string;
  request: string;
  category: string | null;
  sparkNote: string | null;
  adminName: string | null;
  studioName: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

interface CategoryStat {
  category: string;
  count: number;
}

interface ApiResponse {
  requests: FeatureRequest[];
  total: number;
  page: number;
  totalPages: number;
  categoryStats: CategoryStat[];
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Zap; color: string }> = {
  action: { label: "Acción", icon: Zap, color: "text-orange-600 bg-orange-50" },
  query: { label: "Consulta", icon: Search, color: "text-blue-600 bg-blue-50" },
  integration: { label: "Integración", icon: Link2, color: "text-purple-600 bg-purple-50" },
  report: { label: "Reporte", icon: FileText, color: "text-emerald-600 bg-emerald-50" },
  automation: { label: "Automatización", icon: Bot, color: "text-pink-600 bg-pink-50" },
  other: { label: "Otro", icon: HelpCircle, color: "text-gray-600 bg-gray-50" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("es", { day: "numeric", month: "short" });
}

export default function SparkRequestsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "resolved">("pending");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const res = await fetch(`/api/super-admin/spark-requests?${params}`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleResolved = async (id: string, currentState: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch("/api/super-admin/spark-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isResolved: !currentState }),
      });
      if (res.ok) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                requests: prev.requests.map((r) =>
                  r.id === id ? { ...r, isResolved: !currentState, resolvedAt: !currentState ? new Date().toISOString() : null } : r,
                ),
              }
            : prev,
        );
      }
    } catch {}
    setTogglingId(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
          <Sparkles className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Spark Requests
          </h1>
          <p className="text-sm text-gray-500">
            Lo que admins piden y Spark no puede hacer todavía
          </p>
        </div>
      </div>

      {/* Category stats */}
      {data && data.categoryStats.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data.categoryStats.map((stat) => {
            const config = CATEGORY_CONFIG[stat.category] || CATEGORY_CONFIG.other;
            const Icon = config.icon;
            return (
              <button
                key={stat.category}
                onClick={() =>
                  setCategoryFilter(
                    categoryFilter === stat.category ? "all" : stat.category,
                  )
                }
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                  categoryFilter === stat.category
                    ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
                    : "border-gray-100 bg-white hover:border-gray-200"
                }`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{stat.count}</p>
                  <p className="text-[11px] text-gray-500">{config.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400" />
        {(["pending", "all", "resolved"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s === "pending" ? "Pendientes" : s === "resolved" ? "Resueltos" : "Todos"}
            {s === "pending" && data && ` (${data.total})`}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-4 space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border border-gray-100">
              <CardContent className="p-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </CardContent>
            </Card>
          ))
        ) : !data || data.requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sparkles className="mb-3 h-10 w-10 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">
              {statusFilter === "pending"
                ? "No hay requests pendientes"
                : "No se encontraron requests"}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Cuando un admin le pida algo a Spark que no pueda hacer, aparecerá aquí
            </p>
          </div>
        ) : (
          data.requests.map((req) => {
            const config = CATEGORY_CONFIG[req.category || "other"] || CATEGORY_CONFIG.other;
            const Icon = config.icon;

            return (
              <Card
                key={req.id}
                className={`border transition-colors ${
                  req.isResolved ? "border-gray-50 bg-gray-50/50" : "border-gray-100"
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Resolve toggle */}
                    <button
                      onClick={() => toggleResolved(req.id, req.isResolved)}
                      disabled={togglingId === req.id}
                      className="mt-0.5 shrink-0 transition-colors"
                      title={req.isResolved ? "Marcar como pendiente" : "Marcar como resuelto"}
                    >
                      {req.isResolved ? (
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-gray-300 hover:text-emerald-400" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      {/* Request text */}
                      <p className={`text-sm font-medium leading-snug ${req.isResolved ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {req.request}
                      </p>

                      {/* Spark's note */}
                      {req.sparkNote && (
                        <p className="mt-1.5 text-xs leading-relaxed text-gray-500 italic">
                          Spark: &ldquo;{req.sparkNote}&rdquo;
                        </p>
                      )}

                      {/* Meta */}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
                        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${config.color}`}>
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </span>
                        {req.studioName && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {req.studioName}
                          </span>
                        )}
                        {req.adminName && (
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {req.adminName}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeAgo(req.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-1">
          <p className="text-xs text-gray-400">
            Página {data.page} de {data.totalPages} ({data.total} requests)
          </p>
        </div>
      )}

      {/* Stats card */}
      {data && data.total > 0 && (
        <div className="mt-8 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">Resumen</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            <span className="font-bold text-gray-900">{data.total}</span> requests totales
            {data.categoryStats.length > 0 && (
              <>
                {" — "}top categoría:{" "}
                <span className="font-semibold text-gray-700">
                  {CATEGORY_CONFIG[data.categoryStats[0].category]?.label || data.categoryStats[0].category}
                </span>{" "}
                ({data.categoryStats[0].count})
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
