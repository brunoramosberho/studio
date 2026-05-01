"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeftRight,
  Loader2,
  Send,
  UserCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

type Mode = "OPEN" | "DIRECT";

interface EligibleCoach {
  coachProfileId: string;
  userId: string;
  name: string;
  email: string | null;
  image: string | null;
  hasDiscipline: boolean;
  available: boolean;
  hasConflict: boolean;
  weekLoad: number;
}

interface Props {
  classId: string;
  className?: string;
  onCreated?: () => void;
}

export function RequestSubstituteButton({ classId, className, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("OPEN");
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const { data: candidates, isLoading } = useQuery<{ coaches: EligibleCoach[] }>({
    queryKey: ["substitution-eligible", classId],
    queryFn: async () => {
      const res = await fetch(
        `/api/coach/substitutions/eligible-coaches?classId=${classId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/coach/substitutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          mode,
          targetCoachId: mode === "DIRECT" ? selectedCoachId : undefined,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      setOpen(false);
      setMode("OPEN");
      setSelectedCoachId(null);
      setNote("");
      onCreated?.();
    },
  });

  const eligibleForOpen = (candidates?.coaches ?? []).filter(
    (c) => !c.hasConflict && c.hasDiscipline,
  );

  const submitDisabled =
    createMutation.isPending ||
    (mode === "DIRECT" && !selectedCoachId) ||
    (mode === "OPEN" && eligibleForOpen.length === 0 && !isLoading);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn("gap-2", className)}
      >
        <ArrowLeftRight className="h-4 w-4" />
        Pedir suplente
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pedir suplente</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("OPEN")}
              className={cn(
                "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
                mode === "OPEN"
                  ? "border-coach bg-coach/5"
                  : "border-border/50 hover:border-coach/40",
              )}
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-coach" />
                <span className="text-sm font-semibold">Abierta</span>
              </div>
              <p className="text-[11px] text-muted">
                Notifica a todos los elegibles. El primero en aceptar la toma.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMode("DIRECT")}
              className={cn(
                "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
                mode === "DIRECT"
                  ? "border-coach bg-coach/5"
                  : "border-border/50 hover:border-coach/40",
              )}
            >
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-coach" />
                <span className="text-sm font-semibold">Directa</span>
              </div>
              <p className="text-[11px] text-muted">
                Eliges a un instructor específico que debe aceptar.
              </p>
            </button>
          </div>

          {mode === "DIRECT" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Elige instructor
              </p>
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {isLoading ? (
                  <>
                    <Skeleton className="h-12 rounded-lg" />
                    <Skeleton className="h-12 rounded-lg" />
                    <Skeleton className="h-12 rounded-lg" />
                  </>
                ) : (candidates?.coaches.length ?? 0) === 0 ? (
                  <p className="rounded-lg bg-surface p-3 text-xs text-muted">
                    No hay otros instructores en este estudio.
                  </p>
                ) : (
                  candidates!.coaches.map((c) => {
                    const eligible = !c.hasConflict && c.hasDiscipline;
                    return (
                      <button
                        key={c.coachProfileId}
                        type="button"
                        onClick={() =>
                          eligible && setSelectedCoachId(c.coachProfileId)
                        }
                        disabled={!eligible}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                          selectedCoachId === c.coachProfileId &&
                            "border-coach bg-coach/5",
                          !eligible && "opacity-50",
                          eligible &&
                            selectedCoachId !== c.coachProfileId &&
                            "border-border/50 hover:border-coach/30",
                        )}
                      >
                        <UserAvatar
                          user={
                            {
                              name: c.name,
                              image: c.image,
                            } as UserAvatarUser
                          }
                          size={36}
                          showBadge={false}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {c.name}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {c.hasConflict && (
                              <span className="text-[10px] text-red-600">
                                Tiene clase a esa hora
                              </span>
                            )}
                            {!c.hasDiscipline && (
                              <span className="text-[10px] text-amber-600">
                                Sin la disciplina
                              </span>
                            )}
                            {c.hasDiscipline &&
                              !c.hasConflict &&
                              c.available && (
                                <span className="text-[10px] text-green-600">
                                  Disponible
                                </span>
                              )}
                            {c.hasDiscipline &&
                              !c.hasConflict &&
                              !c.available && (
                                <span className="text-[10px] text-amber-600">
                                  Disponibilidad parcial
                                </span>
                              )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {mode === "OPEN" && (
            <div className="rounded-lg bg-surface p-3 text-xs text-muted">
              {isLoading ? (
                "Buscando instructores elegibles…"
              ) : eligibleForOpen.length === 0 ? (
                <span className="flex items-center gap-1.5 text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  No hay instructores con la disciplina disponibles para esa
                  hora.
                </span>
              ) : (
                `Se notificará a ${eligibleForOpen.length} instructor${eligibleForOpen.length === 1 ? "" : "es"}.`
              )}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              Mensaje (opcional)
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Razón o detalle para el instructor…"
              rows={2}
            />
          </div>

          {createMutation.isError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {(createMutation.error as Error).message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={submitDisabled}
              className="gap-2 bg-coach hover:bg-coach/90"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar solicitud
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
