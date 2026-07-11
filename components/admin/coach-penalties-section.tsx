"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { useFormatMoney } from "@/components/tenant-provider";

interface Penalty {
  id: string;
  type: "LATE_ARRIVAL" | "LATE_ENDING" | "OTHER";
  note: string | null;
  amountCents: number | null;
  currency: string | null;
  occurredAt: string;
  createdByName: string | null;
  class: {
    id: string;
    startsAt: string;
    classTypeName: string | null;
    studioName: string | null;
  } | null;
}

const TYPE_LABEL: Record<Penalty["type"], string> = {
  LATE_ARRIVAL: "Llegó tarde",
  LATE_ENDING: "Terminó tarde",
  OTHER: "Otro",
};

export function CoachPenaltiesSection({ coachId }: { coachId: string }) {
  const qc = useQueryClient();
  const fmt = useFormatMoney();

  const { data, isLoading } = useQuery<{ penalties: Penalty[] }>({
    queryKey: ["admin-coach-penalties", coachId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/coach-penalties?coachId=${coachId}`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/coach-penalties/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-coach-penalties", coachId] });
      toast.success("Penalidad eliminada");
    },
    onError: () => toast.error("No se pudo eliminar"),
  });

  const penalties = data?.penalties ?? [];

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">Penalidades</span>
          {penalties.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {penalties.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : penalties.length === 0 ? (
          <p className="py-2 text-sm text-muted">Sin penalidades registradas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {penalties.map((p) => (
              <li key={p.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-medium">{TYPE_LABEL[p.type]}</span>
                    {p.amountCents != null && (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
                        −{fmt((p.amountCents ?? 0) / 100, p.currency)}
                      </span>
                    )}
                  </div>
                  {p.note && <p className="mt-0.5 text-xs text-muted">{p.note}</p>}
                  <p className="mt-0.5 text-[11px] text-muted">
                    {format(new Date(p.occurredAt), "d MMM yyyy", { locale: es })}
                    {p.class?.classTypeName ? ` · ${p.class.classTypeName}` : ""}
                    {p.class?.studioName ? ` · ${p.class.studioName}` : ""}
                    {p.createdByName ? ` · por ${p.createdByName}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm("¿Eliminar penalidad?")) remove.mutate(p.id);
                  }}
                  disabled={remove.isPending}
                  className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-red-600 disabled:opacity-50"
                  aria-label="Eliminar penalidad"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
