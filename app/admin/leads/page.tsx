"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, CheckCircle2, Mail, Phone, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/utils";

interface Lead {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  convertedAt: string | null;
  createdAt: string;
}

interface LeadsResponse {
  leads: Lead[];
  counts: { open: number; converted: number; total: number };
}

const SOURCE_LABELS: Record<string, string> = {
  booking_flow: "Reserva de clase",
  package_purchase: "Compra de paquete",
  magic_link: "Magic link",
  admin_manual: "Manual",
};

export default function LeadsPage() {
  const [filter, setFilter] = useState<"open" | "converted" | "all">("open");

  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey: ["leads", filter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/leads?filter=${filter}`);
      if (!res.ok) throw new Error("Failed to load leads");
      return res.json();
    },
  });

  const leads = data?.leads ?? [];
  const counts = data?.counts ?? { open: 0, converted: 0, total: 0 };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted">
            Personas que dejaron sus datos pero todavía no han comprado o iniciado sesión. Se convierten automáticamente al hacer su primer pago.
          </p>
        </div>
      </header>

      <div className="flex gap-2">
        {(["open", "converted", "all"] as const).map((opt) => {
          const label =
            opt === "open" ? "Sin convertir" : opt === "converted" ? "Convertidos" : "Todos";
          const count =
            opt === "open" ? counts.open : opt === "converted" ? counts.converted : counts.total;
          const active = filter === opt;
          return (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-surface"
              }`}
            >
              {label}
              <span className={active ? "text-background/70" : "text-muted"}>{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
              <UserPlus className="h-5 w-5 text-muted" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">
              {filter === "converted"
                ? "Aún no hay conversiones."
                : "Sin leads por ahora."}
            </p>
            <p className="mt-1 text-xs text-muted">
              Aparecerán aquí cuando alguien llene su info en una reserva o compra sin completarla.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => (
            <motion.div
              key={lead.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Card>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                    {(lead.name ?? lead.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-foreground">
                        {lead.name ?? lead.email}
                      </p>
                      {lead.convertedAt && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Convertido
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {lead.email}
                      </span>
                      {lead.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </span>
                      )}
                      {lead.source && (
                        <span className="inline-flex items-center gap-1">
                          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                            {SOURCE_LABELS[lead.source] ?? lead.source}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-muted">
                    <div className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(new Date(lead.createdAt))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
