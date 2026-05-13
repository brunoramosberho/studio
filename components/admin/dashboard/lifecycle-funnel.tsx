"use client";

import Link from "next/link";
import { Users, ArrowUpRight } from "lucide-react";

export interface LifecycleData {
  lead: number;
  installed: number;
  purchased: number;
  booked: number;
  attended: number;
  member: number;
}

interface Stage {
  label: string;
  count: number;
  color: string;
}

export function LifecycleFunnel({ data }: { data: LifecycleData }) {
  const stages: Stage[] = [
    { label: "Leads", count: data.lead, color: "#94a3b8" },
    { label: "Instalado", count: data.installed, color: "#7c8db5" },
    { label: "Comprado", count: data.purchased, color: "#6478b8" },
    { label: "Reservó", count: data.booked, color: "#5266c0" },
    { label: "Asistió", count: data.attended, color: "#3f55c2" },
    { label: "Recurrente", count: data.member, color: "#2c44c2" },
  ];

  const total = stages.reduce((s, x) => s + x.count, 0);
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted/70" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
              Lifecycle
            </span>
          </div>
          <p className="mt-1 text-[15px] font-semibold text-foreground">
            {total === 0
              ? "Aún no hay miembros"
              : `${total} ${total === 1 ? "miembro" : "miembros"} en tu funnel`}
          </p>
        </div>
        <Link
          href="/admin/clients"
          className="group inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
        >
          Ver clientes
          <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
          <p className="text-sm text-muted">
            Cuando empieces a recibir registros, los verás moverse por aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {stages.map((s, i) => {
            const width = (s.count / max) * 100;
            const prev = i > 0 ? stages[i - 1].count : null;
            const dropPct =
              prev !== null && prev > 0 && s.count < prev
                ? Math.round(((prev - s.count) / prev) * 100)
                : null;

            return (
              <div key={s.label} className="grid grid-cols-[80px_1fr_auto] items-center gap-3">
                <span className="text-[11px] font-medium text-muted/70 truncate">
                  {s.label}
                </span>
                <div className="relative h-6 overflow-hidden rounded-md bg-border/30">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md transition-all duration-500"
                    style={{
                      width: `${Math.max(width, s.count > 0 ? 4 : 0)}%`,
                      backgroundColor: s.color,
                      opacity: 0.85,
                    }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold text-white mix-blend-luminosity">
                    {s.count > 0 ? s.count : ""}
                  </span>
                </div>
                <span className="text-[10px] tabular-nums text-muted/60 w-10 text-right">
                  {dropPct !== null ? `−${dropPct}%` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
