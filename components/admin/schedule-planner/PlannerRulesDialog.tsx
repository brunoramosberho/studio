"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const MAX_LENGTH = 4000;

/**
 * House rules the planner must follow on every conversation, so the admin
 * stops retyping them ("nunca dos clases seguidas a la misma instructora",
 * "sábados solo hasta la 1pm"). Stored on the tenant and injected into the
 * planner's system prompt.
 */
export function PlannerRulesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ schedulePlannerRules: string | null }>({
    queryKey: ["planner-rules"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings/availability");
      if (!res.ok) throw new Error("No se pudieron cargar las reglas");
      return res.json();
    },
    enabled: open,
  });

  const value = draft ?? data?.schedulePlannerRules ?? "";

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/settings/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedulePlannerRules: value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner-rules"] });
      toast.success("Reglas guardadas");
      setDraft(null);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDraft(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reglas para planear</DialogTitle>
          <DialogDescription>
            Spark las respeta en cada planeación, sin que las vuelvas a
            escribir. Una regla por línea, en lenguaje natural.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : (
          <div>
            <textarea
              value={value}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              rows={9}
              placeholder={
                "Ej.:\n- Nunca dos clases seguidas a la misma instructora\n- Los sábados solo hasta la 1 pm\n- Mínimo 2 Flow por semana en cada estudio\n- No repetir la misma disciplina a la misma hora en dos estudios"
              }
              className="w-full rounded-xl border border-border bg-transparent p-3 text-sm leading-relaxed outline-none transition-colors focus:border-admin/40"
            />
            <p className="mt-1 text-right text-[10px] text-muted">
              {value.length}/{MAX_LENGTH}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
            {save.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
