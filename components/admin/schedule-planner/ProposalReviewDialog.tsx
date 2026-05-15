"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  ProposedClass,
  ScheduleProposal,
} from "@/lib/ai/schedule-planner/types";

interface Props {
  open: boolean;
  conversationId: string | null;
  proposal: ScheduleProposal | null;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}

interface EditableClass extends ProposedClass {
  uid: string;
  removed: boolean;
}

export function ProposalReviewDialog({
  open,
  conversationId,
  proposal,
  onOpenChange,
  onApplied,
}: Props) {
  const [items, setItems] = useState<EditableClass[]>([]);
  const [applying, setApplying] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!proposal) {
      setItems([]);
      return;
    }
    setItems(
      proposal.classes.map((c, idx) => ({
        ...c,
        uid: `${idx}-${c.startsAt}`,
        removed: false,
      })),
    );
  }, [proposal]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, EditableClass[]>();
    for (const c of items) {
      const day = c.startsAt.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(c);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, list]) => ({
        day,
        list: list.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      }));
  }, [items]);

  const activeCount = items.filter((i) => !i.removed).length;
  const removedCount = items.length - activeCount;

  function toggleRemove(uid: string) {
    setItems((prev) =>
      prev.map((p) => (p.uid === uid ? { ...p, removed: !p.removed } : p)),
    );
  }

  function patchTime(uid: string, value: string) {
    // Accept "HH:mm" and patch the time portion while preserving the date.
    setItems((prev) =>
      prev.map((p) => {
        if (p.uid !== uid) return p;
        const start = new Date(p.startsAt);
        const end = new Date(p.endsAt);
        const duration = end.getTime() - start.getTime();
        const [hh, mm] = value.split(":").map((x) => parseInt(x, 10));
        if (Number.isNaN(hh) || Number.isNaN(mm)) return p;
        start.setHours(hh, mm, 0, 0);
        const newEnd = new Date(start.getTime() + duration);
        return {
          ...p,
          startsAt: start.toISOString(),
          endsAt: newEnd.toISOString(),
        };
      }),
    );
  }

  async function applyProposal() {
    if (!conversationId) return;
    const payload = items
      .filter((i) => !i.removed)
      .map((i) => ({
        classTypeId: i.classTypeId,
        coachId: i.coachId,
        roomId: i.roomId,
        startsAt: i.startsAt,
        endsAt: i.endsAt,
      }));
    if (payload.length === 0) {
      toast.error("No hay clases para crear");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(
        `/api/admin/schedule-planner/conversations/${conversationId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classes: payload }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al crear las clases");
        return;
      }
      if (data.failed > 0) {
        toast.warning(
          `${data.created} de ${data.total} clases creadas. ${data.failed} fallaron.`,
        );
      } else {
        toast.success(`${data.created} clases creadas`);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-schedule"] });
      onApplied();
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setApplying(false);
    }
  }

  if (!proposal) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Revisa la propuesta de Spark</DialogTitle>
          <DialogDescription>
            {proposal.classes.length} clases del{" "}
            {format(parseISO(proposal.horizon.startDate), "d MMM", { locale: es })} al{" "}
            {format(parseISO(proposal.horizon.endDate), "d MMM yyyy", { locale: es })}.
            Edita la hora o elimina las que no quieras antes de crearlas.
          </DialogDescription>
        </DialogHeader>

        {proposal.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <AlertCircle className="h-3.5 w-3.5" />
              Avisos
            </div>
            <ul className="list-inside list-disc space-y-0.5">
              {proposal.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Hora</th>
                <th className="px-3 py-2 text-left font-medium">Disciplina</th>
                <th className="px-3 py-2 text-left font-medium">Coach</th>
                <th className="px-3 py-2 text-left font-medium">Estudio · Sala</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ day, list }) => (
                <DayRows
                  key={day}
                  day={day}
                  list={list}
                  onRemove={toggleRemove}
                  onPatchTime={patchTime}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted">
            <strong className="text-foreground">{activeCount}</strong> clases listas para crear
            {removedCount > 0 && (
              <>
                {" "}
                · <span className="text-muted">{removedCount} eliminadas</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={applying}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={applyProposal}
              disabled={applying || activeCount === 0}
              className="bg-admin hover:bg-admin/90"
            >
              {applying ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Crear {activeCount} {activeCount === 1 ? "clase" : "clases"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DayRows({
  day,
  list,
  onRemove,
  onPatchTime,
}: {
  day: string;
  list: EditableClass[];
  onRemove: (uid: string) => void;
  onPatchTime: (uid: string, value: string) => void;
}) {
  const date = parseISO(day);
  const dayLabel = format(date, "EEEE d MMM", { locale: es });
  return (
    <>
      <tr className="bg-surface/40">
        <td colSpan={5} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {dayLabel}{" "}
          <span className="ml-1 text-muted/60">· {list.filter((l) => !l.removed).length} de {list.length}</span>
        </td>
      </tr>
      {list.map((c) => {
        const start = new Date(c.startsAt);
        const timeValue = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
        return (
          <tr
            key={c.uid}
            className={cn(
              "border-t border-border/40",
              c.removed && "opacity-40 line-through",
            )}
          >
            <td className="px-3 py-2">
              <Input
                value={timeValue}
                onChange={(e) => onPatchTime(c.uid, e.target.value)}
                type="time"
                disabled={c.removed}
                className="h-8 w-[88px] text-xs"
              />
            </td>
            <td className="px-3 py-2">
              <Badge variant="outline" className="text-[11px]">{c.classTypeName}</Badge>
            </td>
            <td className="px-3 py-2 text-foreground">{c.coachName}</td>
            <td className="px-3 py-2 text-muted">
              {c.studioName} · {c.roomName}
            </td>
            <td className="px-3 py-2 text-right">
              <button
                onClick={() => onRemove(c.uid)}
                className="rounded p-1 text-muted hover:bg-surface hover:text-red-500"
                title={c.removed ? "Restaurar" : "Quitar"}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </td>
          </tr>
        );
      })}
    </>
  );
}
