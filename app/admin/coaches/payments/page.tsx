"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Users,
  CalendarDays,
  Wallet,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ClassLine {
  classId: string;
  startsAt: string;
  classTypeId: string;
  classTypeName: string;
  classTypeColor: string;
  studioId: string | null;
  studioName: string;
  roomName: string;
  attendees: number;
  capacity: number;
  occupancyPct: number;
  rateType: "PER_CLASS" | "PER_STUDENT" | "OCCUPANCY_TIER";
  rateLabel: string;
  multiplier: number;
  amount: number;
  isPast: boolean;
}

interface CoachPay {
  coachId: string;
  name: string;
  photoUrl: string | null;
  hasRates: boolean;
  monthlyFixed: number;
  classesCount: number;
  classLines: ClassLine[];
}

interface PaymentsResponse {
  month: string;
  currency: string;
  coaches: CoachPay[];
  studios: { id: string; name: string }[];
  classTypes: { id: string; name: string }[];
}

const RATE_LABEL: Record<string, string> = {
  PER_CLASS: "Por clase",
  PER_STUDENT: "Por alumno",
  OCCUPANCY_TIER: "Bono ocupación",
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CoachPaymentsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [studioId, setStudioId] = useState("");
  const [classTypeId, setClassTypeId] = useState("");
  const [status, setStatus] = useState<"all" | "past" | "upcoming">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error } = useQuery<PaymentsResponse>({
    queryKey: ["coach-payments", month],
    queryFn: async () => {
      const res = await fetch(`/api/admin/coach-payments?month=${month}`);
      if (!res.ok) throw { status: res.status };
      return res.json();
    },
    retry: false,
  });

  const fmt = useMemo(() => {
    const code = data?.currency ?? "EUR";
    return (n: number) =>
      new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: 0 }).format(n);
  }, [data?.currency]);

  const filterLine = (l: ClassLine) =>
    (!studioId || l.studioId === studioId) &&
    (!classTypeId || l.classTypeId === classTypeId) &&
    (status === "past" ? l.isPast : status === "upcoming" ? !l.isPast : true);

  const includeFixed = !studioId && !classTypeId && status !== "upcoming";

  const rows = useMemo(() => {
    if (!data) return [];
    return data.coaches
      .map((c) => {
        const lines = c.classLines.filter(filterLine);
        const fixed = includeFixed ? c.monthlyFixed : 0;
        const earned = lines.filter((l) => l.isPast).reduce((s, l) => s + l.amount, 0) + fixed;
        const projected = lines.filter((l) => !l.isPast).reduce((s, l) => s + l.amount, 0);
        return { ...c, lines, fixed, earned, projected, total: earned + projected };
      })
      .filter((c) => c.lines.length > 0 || c.fixed > 0)
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, studioId, classTypeId, status]);

  const grandTotal = rows.reduce((s, c) => s + c.total, 0);
  const totalClasses = rows.reduce((s, c) => s + c.lines.length, 0);

  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    return format(new Date(y, m - 1, 1), "MMMM yyyy", { locale: es });
  })();

  const exportUrl = `/api/admin/coach-payments/export?month=${month}${
    studioId ? `&studioId=${studioId}` : ""
  }${classTypeId ? `&classTypeId=${classTypeId}` : ""}${status !== "all" ? `&status=${status}` : ""}`;

  if (isError) {
    const status403 = (error as { status?: number } | null)?.status === 403;
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Wallet className="mx-auto h-10 w-10 text-muted/40" />
        <p className="mt-3 font-medium text-foreground">
          {status403 ? "No tienes acceso a esta sección" : "No se pudieron cargar los pagos"}
        </p>
        <Link href="/admin/coaches" className="mt-3 inline-block text-sm text-accent underline">
          Volver a coaches
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div>
        <Link
          href="/admin/coaches"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Coaches
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Pagos a coaches</h1>
          <div className="flex items-center gap-2">
            {/* Month nav */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-1 py-0.5">
              <button
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
                className="rounded p-1.5 text-muted hover:bg-surface hover:text-foreground"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[7.5rem] text-center text-sm font-medium capitalize">
                {monthLabel}
              </span>
              <button
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
                className="rounded p-1.5 text-muted hover:bg-surface hover:text-foreground"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <a href={exportUrl} download>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Excel
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {data && data.studios.length > 0 && (
          <select
            value={studioId}
            onChange={(e) => setStudioId(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none"
          >
            <option value="">Todos los estudios</option>
            {data.studios.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        {data && data.classTypes.length > 0 && (
          <select
            value={classTypeId}
            onChange={(e) => setClassTypeId(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none"
          >
            <option value="">Todas las disciplinas</option>
            {data.classTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>{ct.name}</option>
            ))}
          </select>
        )}
        <div className="flex rounded-lg border border-border bg-card p-0.5 text-sm">
          {([
            ["all", "Todas"],
            ["past", "Impartidas"],
            ["upcoming", "Próximas"],
          ] as const).map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setStatus(val)}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                status === val ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground",
              )}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Wallet, label: "Total a pagar", value: fmt(grandTotal) },
          { icon: Users, label: "Coaches", value: String(rows.length) },
          { icon: CalendarDays, label: "Clases", value: String(totalClasses) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                <s.icon className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-foreground sm:text-xl">{s.value}</p>
                <p className="text-[11px] text-muted">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Coach list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted">
            No hay pagos para este periodo con los filtros actuales.
            <p className="mt-1 text-xs text-muted/70">
              Configura las tarifas de cada coach en su perfil para ver su desglose.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => {
            const open = expanded.has(c.coachId);
            return (
              <Card key={c.coachId} className="overflow-hidden">
                <button
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.coachId)) next.delete(c.coachId);
                      else next.add(c.coachId);
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface/40"
                >
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photoUrl} alt={c.name} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                      {c.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold">{c.name}</p>
                    <p className="text-xs text-muted">
                      {c.lines.length} clase{c.lines.length === 1 ? "" : "s"}
                      {c.fixed > 0 && ` · fijo ${fmt(c.fixed)}`}
                      {!c.hasRates && " · sin tarifa configurada"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-base font-bold text-foreground">{fmt(c.total)}</p>
                    <p className="text-[11px] text-muted">
                      {fmt(c.earned)} impartido
                      {c.projected > 0 && ` · ${fmt(c.projected)} prox.`}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
                  />
                </button>

                {open && c.lines.length > 0 && (
                  <div className="overflow-x-auto border-t border-border/40">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/40 text-left text-[11px] uppercase tracking-wide text-muted">
                          <th className="px-4 py-2 font-medium">Fecha</th>
                          <th className="px-3 py-2 font-medium">Disciplina</th>
                          <th className="px-3 py-2 font-medium">Estudio</th>
                          <th className="px-3 py-2 text-center font-medium">Asist.</th>
                          <th className="px-3 py-2 text-center font-medium">Ocup.</th>
                          <th className="px-3 py-2 font-medium">Tarifa</th>
                          <th className="px-4 py-2 text-right font-medium">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.lines.map((l, i) => (
                          <tr
                            key={`${l.classId}-${l.rateType}-${i}`}
                            className={cn("border-b border-border/20", !l.isPast && "opacity-70")}
                          >
                            <td className="whitespace-nowrap px-4 py-2">
                              {format(new Date(l.startsAt), "d MMM, HH:mm", { locale: es })}
                              {!l.isPast && (
                                <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                  prox.
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: l.classTypeColor }}
                                />
                                {l.classTypeName}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted">{l.studioName}</td>
                            <td className="px-3 py-2 text-center">{l.attendees}/{l.capacity}</td>
                            <td className="px-3 py-2 text-center">{l.occupancyPct}%</td>
                            <td className="px-3 py-2 text-xs text-muted">
                              {RATE_LABEL[l.rateType]}
                              {l.multiplier > 1 && (
                                <span className="ml-1 font-semibold text-accent">×{l.multiplier}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right font-medium">{fmt(l.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
