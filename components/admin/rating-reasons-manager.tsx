"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// The chips a member picks from after a low rating. Studios can word them in
// their own language, retire the ones that don't apply, and add discipline
// specific ones (those replace the general list for that discipline).

interface Reason {
  id: string;
  text: string;
  emoji: string;
  order: number;
  active: boolean;
  classTypeId: string | null;
  classType: { name: string } | null;
}

const ALL = "__general__";

export function RatingReasonsManager() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState("");
  const [scope, setScope] = useState<string>(ALL);

  const { data, isLoading } = useQuery<{
    reasons: Reason[];
    classTypes: { id: string; name: string }[];
  }>({
    queryKey: ["admin-rating-reasons"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ratings/reasons");
      if (!res.ok) throw new Error("No se pudieron cargar los motivos");
      return res.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-rating-reasons"] });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/ratings/reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          emoji,
          classTypeId: scope === ALL ? null : scope,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Error");
    },
    onSuccess: () => {
      setText("");
      setEmoji("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seed = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/ratings/reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seedDefaults: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Error");
      return body as { added: number };
    },
    onSuccess: (r) => {
      invalidate();
      toast.success(
        r.added > 0 ? `${r.added} motivos añadidos` : "Ya tenías todos los motivos base",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/admin/ratings/reasons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: invalidate,
    onError: () => toast.error("No se pudo actualizar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/ratings/reasons/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: invalidate,
    onError: () => toast.error("No se pudo eliminar"),
  });

  const reasons = data?.reasons ?? [];
  const general = reasons.filter((r) => !r.classTypeId);
  const byDiscipline = reasons.filter((r) => r.classTypeId);

  const row = (r: Reason) => (
    <div
      key={r.id}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2",
        !r.active && "opacity-50",
      )}
    >
      <span className="text-base">{r.emoji}</span>
      <span className="flex-1 truncate text-sm">{r.text}</span>
      {r.classType && (
        <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted">
          {r.classType.name}
        </span>
      )}
      <button
        onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
        className="rounded px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        {r.active ? "Ocultar" : "Mostrar"}
      </button>
      <button
        onClick={() => remove.mutate(r.id)}
        className="rounded p-1 text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
        aria-label="Eliminar"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <section className="rounded-sm border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Motivos de valoración</h2>
          <p className="mt-1 text-xs text-muted">
            Lo que puede elegir un alumno cuando califica 4 estrellas o menos. Si no
            configuras ninguno se usan los siete de fábrica.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => seed.mutate()}
          disabled={seed.isPending}
        >
          {seed.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Cargar motivos base
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-40 w-full rounded-lg" />
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {general.length > 0 ? (
              general.map(row)
            ) : (
              <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted">
                Sin motivos propios — tus alumnos ven los siete de fábrica.
              </p>
            )}
          </div>

          {byDiscipline.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted/60">
                Por disciplina
              </p>
              <div className="space-y-2">{byDiscipline.map(row)}</div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border/50 pt-4">
            <div className="w-[70px]">
              <label className="mb-1 block text-[10px] text-muted">Emoji</label>
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="💬"
                className="h-8 text-center text-sm"
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-[10px] text-muted">Motivo</label>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 60))}
                placeholder="Ej.: La temperatura de la sala"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && text.trim()) create.mutate();
                }}
              />
            </div>
            <div className="w-[170px]">
              <label className="mb-1 block text-[10px] text-muted">Aplica a</label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas las clases</SelectItem>
                  {(data?.classTypes ?? []).map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>
                      {ct.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => create.mutate()}
              disabled={!text.trim() || create.isPending}
            >
              {create.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Añadir
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
