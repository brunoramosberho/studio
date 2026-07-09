"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Trash2, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type RangeKey = "30" | "90" | "365" | "0";

interface RatingRow {
  id: string;
  rating: number;
  reasons: string[];
  comment: string | null;
  source: string;
  createdAt: string;
  member: { id: string; name: string | null; image: string | null };
  class: { id: string; startsAt: string; discipline: string; color: string };
  coach: { id: string; name: string; photoUrl: string | null };
}

interface RatingsReport {
  days: number;
  summary: {
    total: number;
    average: number;
    distribution: Record<string, number>;
  };
  byCoach: { coachId: string; name: string; average: number; count: number }[];
  byDiscipline: { disciplineId: string; name: string; color: string; average: number; count: number }[];
  topReasons: { reason: string; count: number }[];
  ratings: RatingRow[];
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "30", label: "30 días" },
  { key: "90", label: "90 días" },
  { key: "365", label: "1 año" },
  { key: "0", label: "Todo" },
];

const SOURCE_LABEL: Record<string, string> = {
  app_sheet: "App",
  email: "Email",
  class_page: "Página de clase",
};

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} de 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          style={{ width: size, height: size }}
          className={cn(
            s <= n ? "fill-amber-400 text-amber-400" : "fill-transparent text-stone-300 dark:text-stone-600",
          )}
        />
      ))}
    </span>
  );
}

export default function RatingsPage() {
  const [range, setRange] = useState<RangeKey>("90");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<RatingsReport>({
    queryKey: ["admin-ratings", range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/ratings?days=${range}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/ratings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    },
    onSuccess: () => {
      setConfirmId(null);
      qc.invalidateQueries({ queryKey: ["admin-ratings"] });
    },
  });

  const dist = data?.summary.distribution ?? {};
  const maxDist = Math.max(1, ...Object.values(dist));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Valoraciones</h1>
          <p className="mt-1 text-sm text-muted">
            Cómo califican tus alumnos cada clase — por instructor, disciplina y con
            el detalle de cada valoración.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                range === r.key ? "bg-admin text-white" : "text-muted hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* Summary */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-sm border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Promedio</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-20" />
          ) : (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {data?.summary.total ? data.summary.average.toFixed(1) : "—"}
              </span>
              {!!data?.summary.total && <Stars n={Math.round(data.summary.average)} size={16} />}
            </div>
          )}
        </div>
        <div className="rounded-sm border border-border/60 bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total valoraciones</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {isLoading ? <Skeleton className="inline-block h-7 w-14" /> : data?.summary.total ?? 0}
          </p>
        </div>
        <div className="rounded-sm border border-border/60 bg-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Distribución</p>
          <div className="space-y-1">
            {[5, 4, 3, 2, 1].map((s) => {
              const count = dist[String(s)] ?? 0;
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-3 tabular-nums text-muted">{s}</span>
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${(count / maxDist) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right tabular-nums text-muted">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* By instructor */}
      <div className="rounded-sm border border-border/60 bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <User className="h-4 w-4" /> Por instructor
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (data?.byCoach ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Sin valoraciones en este rango.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2">Instructor</th>
                <th className="py-2 text-right">Valoraciones</th>
                <th className="py-2 text-right">Promedio</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byCoach ?? []).map((c) => (
                <tr key={c.coachId} className="border-t border-border/50">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="py-2 text-right tabular-nums">{c.count}</td>
                  <td className="py-2">
                    <span className="flex items-center justify-end gap-2">
                      <span className="tabular-nums">{c.average.toFixed(1)}</span>
                      <Stars n={Math.round(c.average)} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Individual ratings */}
      <div className="rounded-sm border border-border/60 bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="h-4 w-4" /> Detalle
          {!!data?.ratings.length && (
            <span className="text-xs font-normal text-muted">({data.ratings.length})</span>
          )}
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (data?.ratings ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Sin valoraciones en este rango.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {(data?.ratings ?? []).map((r) => (
              <li key={r.id} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Stars n={r.rating} />
                    <span className="text-sm font-medium">{r.class.discipline}</span>
                    <span className="text-xs text-muted">· {r.coach.name}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {r.member.name ?? "Miembro"} ·{" "}
                    {new Date(r.class.startsAt).toLocaleDateString("es-ES", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    {" · "}
                    {new Date(r.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                    {" · "}
                    {SOURCE_LABEL[r.source] ?? r.source}
                  </p>
                  {r.reasons.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.reasons.map((reason) => (
                        <span
                          key={reason}
                          className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-foreground/70"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.comment && (
                    <p className="mt-1.5 rounded-md bg-surface/60 px-3 py-2 text-[13px] text-foreground/80">
                      “{r.comment}”
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {confirmId === r.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => del.mutate(r.id)}
                        disabled={del.isPending}
                        className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {del.isPending ? "…" : "Eliminar"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted hover:text-foreground"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(r.id)}
                      title="Eliminar valoración"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
