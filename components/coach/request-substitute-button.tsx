"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Check,
  Clock,
  Loader2,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ReasonType = "PERSONAL" | "ILLNESS" | "EMERGENCY" | "TRAVEL" | "OTHER";

const REASON_LABELS: Record<ReasonType, string> = {
  PERSONAL: "Personal",
  ILLNESS: "Enfermedad",
  EMERGENCY: "Emergencia",
  TRAVEL: "Viaje",
  OTHER: "Otro",
};

interface EligibleCoach {
  coachProfileId: string;
  userId: string;
  name: string;
  email: string | null;
  image: string | null;
  hasDiscipline: boolean;
  available: boolean;
  slotStatus: "preferred" | "ok_if_needed" | "unavailable" | "time_off";
  availabilityConfigured: boolean;
  hasConflict: boolean;
  weekLoad: number;
}

type SwapAvailabilityWarning = "absent" | "unmarked" | null;

interface SwapCandidate {
  classId: string;
  classTypeName: string;
  startsAt: string;
  endsAt: string;
  coach: { profileId: string; userId: string; name: string; image: string | null };
  studio: { id: string; name: string };
  theyCanTeachYours: boolean;
  youCanTeachTheirs: boolean;
  theirAvailabilityWarning: SwapAvailabilityWarning;
  yourAvailabilityWarning: SwapAvailabilityWarning;
  fullyCompatible: boolean;
}

interface SwapCandidatesResponse {
  candidates: SwapCandidate[];
  totalFutureClasses: number;
  requesterHasSpecialties: boolean;
}

interface Props {
  classId: string;
  /** UTC ISO of the class start — used to show how urgent the request is. */
  classStartsAt?: string;
  className?: string;
  onCreated?: () => void;
}

export function RequestSubstituteButton({
  classId,
  classStartsAt,
  className,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn("gap-2", className)}
      >
        <ArrowLeftRight className="h-4 w-4" />
        Pedir cobertura
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="px-5 pb-3 pt-5">
            <DialogTitle>Pedir cobertura</DialogTitle>
            <DialogDescription>
              Elige cómo quieres cubrir tu clase.
            </DialogDescription>
          </DialogHeader>
          <CoverageTabs
            classId={classId}
            classStartsAt={classStartsAt}
            onDone={() => {
              setOpen(false);
              onCreated?.();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Tabs container ────────────────────────────────────────────────────

function CoverageTabs({
  classId,
  classStartsAt,
  onDone,
}: {
  classId: string;
  classStartsAt?: string;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<"request" | "manual" | "swap">("request");

  const { data: settings } = useQuery<{ subRequestAdminApprovalHours: number }>({
    queryKey: ["substitutions-settings"],
    queryFn: async () => {
      // Public endpoint not exposed; admins-only PATCH but anyone can read
      // the threshold via the coach inbox response. Defer to a static
      // "ask the studio" fallback if it fails.
      const res = await fetch("/api/admin/substitutions/settings");
      if (!res.ok) return { subRequestAdminApprovalHours: 24 };
      return res.json();
    },
    staleTime: 60_000,
  });

  // Date.now() can't run during render (purity rule). We snapshot it
  // into state via an effect — a "compute on data arrival" pattern.
  const [isUrgent, setIsUrgent] = useState<boolean | null>(null);
  useEffect(() => {
    if (!classStartsAt || !settings) return;
    const hoursUntil = (new Date(classStartsAt).getTime() - Date.now()) / 3_600_000;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsUrgent(hoursUntil <= settings.subRequestAdminApprovalHours);
  }, [classStartsAt, settings]);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex flex-1 flex-col">
      <div className="border-b px-5">
        <TabsList className="h-auto bg-transparent p-0">
          <TabsTrigger value="request" className="gap-1.5">
            <Users className="h-4 w-4" />
            Pedir suplente
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-1.5">
            <UserCheck className="h-4 w-4" />
            Asignar directo
          </TabsTrigger>
          <TabsTrigger value="swap" className="gap-1.5">
            <ArrowLeftRight className="h-4 w-4" />
            Intercambio
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="request" className="m-0 flex-1 overflow-y-auto">
        <RequestTab classId={classId} isUrgent={isUrgent} onDone={onDone} />
      </TabsContent>
      <TabsContent value="manual" className="m-0 flex-1 overflow-y-auto">
        <ManualAssignTab classId={classId} onDone={onDone} />
      </TabsContent>
      <TabsContent value="swap" className="m-0 flex-1 overflow-y-auto">
        <SwapTab classId={classId} onDone={onDone} />
      </TabsContent>
    </Tabs>
  );
}

// ── Reason picker (shared) ────────────────────────────────────────────

function ReasonFields({
  reasonType,
  setReasonType,
  reasonNote,
  setReasonNote,
}: {
  reasonType: ReasonType | "";
  setReasonType: (r: ReasonType) => void;
  reasonNote: string;
  setReasonNote: (s: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">
          Motivo <span className="text-destructive">*</span>
        </label>
        <Select value={reasonType} onValueChange={(v) => setReasonType(v as ReasonType)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona un motivo" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(REASON_LABELS) as ReasonType[]).map((r) => (
              <SelectItem key={r} value={r}>
                {REASON_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">
          Nota (opcional)
        </label>
        <Textarea
          value={reasonNote}
          onChange={(e) => setReasonNote(e.target.value)}
          placeholder="Detalles que ayuden al admin o al suplente"
          rows={2}
          maxLength={500}
        />
      </div>
    </div>
  );
}

// ── Pill helpers ──────────────────────────────────────────────────────

function CoachStatusPill({ coach }: { coach: EligibleCoach }) {
  // Same wording as the coach picker in /admin/schedule. "unavailable" splits
  // into "Sin configurar" (no availability set up yet) vs "Fuera de su horario"
  // (has availability, but not for this slot) — clearer than "No marcó disponible".
  const neutral = "bg-stone-100 text-stone-600 dark:bg-stone-500/15 dark:text-stone-300";
  const map: Record<EligibleCoach["slotStatus"], { label: string; tone: string }> = {
    preferred: { label: "Preferido", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
    ok_if_needed: { label: "De respaldo", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
    unavailable: {
      label: coach.availabilityConfigured ? "Fuera de su horario" : "Sin configurar",
      tone: neutral,
    },
    time_off: { label: "Ausente", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  };
  const m = map[coach.slotStatus];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", m.tone)}>
      {m.label}
    </span>
  );
}

// ── Swap compatibility badges ─────────────────────────────────────────

function SwapPill({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tone)}>
      {label}
    </span>
  );
}

function SwapWarnings({ candidate: c }: { candidate: SwapCandidate }) {
  const pills: { tone: string; label: string }[] = [];

  if (c.fullyCompatible) {
    pills.push({
      tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
      label: "Compatible",
    });
  } else {
    if (!c.theyCanTeachYours) {
      pills.push({
        tone: "bg-stone-100 text-stone-600 dark:bg-stone-500/15 dark:text-stone-300",
        label: "No tiene tu disciplina",
      });
    }
    if (!c.youCanTeachTheirs) {
      pills.push({
        tone: "bg-stone-100 text-stone-600 dark:bg-stone-500/15 dark:text-stone-300",
        label: "No es tu disciplina",
      });
    }
  }

  const availTone = (w: SwapAvailabilityWarning) =>
    w === "absent"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";

  if (c.theirAvailabilityWarning) {
    pills.push({
      tone: availTone(c.theirAvailabilityWarning),
      label:
        c.theirAvailabilityWarning === "absent"
          ? "Ausente a tu hora"
          : "No marcó tu hora",
    });
  }
  if (c.yourAvailabilityWarning) {
    pills.push({
      tone: availTone(c.yourAvailabilityWarning),
      label:
        c.yourAvailabilityWarning === "absent"
          ? "Ausente a su hora"
          : "No marcaste su hora",
    });
  }

  if (pills.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {pills.map((p, i) => (
        <SwapPill key={i} tone={p.tone} label={p.label} />
      ))}
    </div>
  );
}

// ── Tab: pedir suplente (REQUEST) ─────────────────────────────────────

function RequestTab({
  classId,
  isUrgent,
  onDone,
}: {
  classId: string;
  isUrgent: boolean | null;
  onDone: () => void;
}) {
  const [reasonType, setReasonType] = useState<ReasonType | "">("");
  const [reasonNote, setReasonNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ coaches: EligibleCoach[] }>({
    queryKey: ["substitution-eligible", classId],
    queryFn: async () => {
      const res = await fetch(
        `/api/coach/substitutions/eligible-coaches?classId=${classId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const coaches = data?.coaches ?? [];
  const availableForBroadcast = coaches.filter(
    (c) => !c.hasConflict && c.hasDiscipline && c.slotStatus !== "time_off",
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/coach/substitutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          mode: "REQUEST",
          targetCoachIds: Array.from(selected),
          reasonType,
          reasonNote: reasonNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      return json;
    },
    onSuccess: onDone,
    onError: (e: Error) => setError(e.message),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllAvailable = () => {
    setSelected(new Set(availableForBroadcast.map((c) => c.coachProfileId)));
  };

  const canSubmit = !mutation.isPending && reasonType && selected.size > 0;

  return (
    <div className="space-y-4 px-5 py-4">
      <ReasonFields
        reasonType={reasonType}
        setReasonType={setReasonType}
        reasonNote={reasonNote}
        setReasonNote={setReasonNote}
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-muted">
            Selecciona a quién enviarle la solicitud
          </label>
          {availableForBroadcast.length > 0 && (
            <button
              type="button"
              onClick={selectAllAvailable}
              className="text-primary text-xs font-medium hover:underline"
            >
              Seleccionar todos los disponibles
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : coaches.length === 0 ? (
          <p className="text-muted text-sm">No hay instructores en el estudio.</p>
        ) : (
          <ul className="max-h-[260px] space-y-1.5 overflow-y-auto rounded-md border p-1">
            {coaches.map((c) => {
              const disabled = c.hasConflict;
              const checked = selected.has(c.coachProfileId);
              return (
                <li key={c.coachProfileId}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(c.coachProfileId)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition",
                      disabled
                        ? "cursor-not-allowed opacity-50"
                        : checked
                        ? "bg-primary/10"
                        : "hover:bg-muted/40",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          checked ? "border-primary bg-primary text-primary-foreground" : "border-input-border",
                        )}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </div>
                      <UserAvatar
                        user={{ name: c.name, image: c.image }}
                        size={32}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{c.name}</div>
                        <div className="text-muted-foreground text-[11px]">
                          {!c.hasDiscipline && "Sin la disciplina · "}
                          {c.weekLoad > 0 && `${c.weekLoad} clases esta semana`}
                        </div>
                      </div>
                    </div>
                    {c.hasConflict ? (
                      <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">
                        Tiene clase
                      </Badge>
                    ) : (
                      <CoachStatusPill coach={c} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {isUrgent !== null && (
        <div
          className={cn(
            "rounded-md border p-3 text-xs",
            isUrgent
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-emerald-200"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-200",
          )}
        >
          {isUrgent ? (
            <>
              <Clock className="mr-1 inline h-3 w-3" /> Urgente: notificamos a los coaches al instante.
            </>
          ) : (
            <>
              <ShieldAlert className="mr-1 inline h-3 w-3" /> Tu solicitud pasará primero al admin para aprobación porque la clase es en más de unas horas.
            </>
          )}
        </div>
      )}

      {error && <p className="text-destructive text-xs">{error}</p>}

      <DialogFooter className="border-t pt-3">
        <Button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit}
        >
          {mutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Enviar solicitud ({selected.size})
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Tab: asignar directo (MANUAL_ASSIGN) ──────────────────────────────

function ManualAssignTab({ classId, onDone }: { classId: string; onDone: () => void }) {
  const [reasonType, setReasonType] = useState<ReasonType | "">("");
  const [reasonNote, setReasonNote] = useState("");
  const [targetCoachId, setTargetCoachId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<EligibleCoach | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ coaches: EligibleCoach[] }>({
    queryKey: ["substitution-eligible", classId],
    queryFn: async () => {
      const res = await fetch(
        `/api/coach/substitutions/eligible-coaches?classId=${classId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const coaches = data?.coaches ?? [];

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/coach/substitutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          mode: "MANUAL_ASSIGN",
          targetCoachId: id,
          reasonType,
          reasonNote: reasonNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      return json;
    },
    onSuccess: onDone,
    onError: (e: Error) => setError(e.message),
  });

  const handlePick = (c: EligibleCoach) => {
    if (!reasonType) {
      setError("Selecciona un motivo primero");
      return;
    }
    setError(null);
    if (c.hasConflict) return;
    if (c.slotStatus === "time_off" || c.slotStatus === "unavailable") {
      setConfirmTarget(c);
      return;
    }
    setTargetCoachId(c.coachProfileId);
    mutation.mutate(c.coachProfileId);
  };

  return (
    <div className="space-y-4 px-5 py-4">
      <ReasonFields
        reasonType={reasonType}
        setReasonType={setReasonType}
        reasonNote={reasonNote}
        setReasonNote={setReasonNote}
      />

      <div>
        <label className="mb-2 block text-xs font-medium text-muted">
          ¿A quién le asignaste la clase?
        </label>
        <p className="text-muted-foreground mb-2 text-[11px]">
          Esto asume que ya hablaste con esa persona fuera del sistema. La asignación queda confirmada al instante.
        </p>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <ul className="max-h-[280px] space-y-1.5 overflow-y-auto rounded-md border p-1">
            {coaches.map((c) => (
              <li key={c.coachProfileId}>
                <button
                  type="button"
                  disabled={c.hasConflict || mutation.isPending}
                  onClick={() => handlePick(c)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition",
                    c.hasConflict
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-muted/40",
                    targetCoachId === c.coachProfileId && "bg-primary/10",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <UserAvatar user={{ name: c.name, image: c.image }} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{c.name}</div>
                      <div className="text-muted-foreground text-[11px]">
                        {!c.hasDiscipline && "Sin la disciplina · "}
                        {c.weekLoad > 0 && `${c.weekLoad} clases esta semana`}
                      </div>
                    </div>
                  </div>
                  {c.hasConflict ? (
                    <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">
                      Tiene clase
                    </Badge>
                  ) : (
                    <CoachStatusPill coach={c} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}

      {/* Confirmation dialog for non-available coaches */}
      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar asignación</DialogTitle>
            <DialogDescription>
              {confirmTarget && (
                <>
                  <strong>{confirmTarget.name}</strong>{" "}
                  {confirmTarget.slotStatus === "time_off"
                    ? "marcó este día como ausente."
                    : "no marcó este horario como disponible."}{" "}
                  ¿Confirmar que la asignas de todas formas?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (confirmTarget) {
                  setTargetCoachId(confirmTarget.coachProfileId);
                  mutation.mutate(confirmTarget.coachProfileId);
                  setConfirmTarget(null);
                }
              }}
            >
              Sí, asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tab: intercambio (SWAP) ───────────────────────────────────────────

function SwapTab({ classId, onDone }: { classId: string; onDone: () => void }) {
  const [reasonType, setReasonType] = useState<ReasonType | "">("");
  const [reasonNote, setReasonNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<SwapCandidatesResponse>({
    queryKey: ["swap-candidates", classId],
    queryFn: async () => {
      const res = await fetch(
        `/api/coach/substitutions/swap-candidates?classId=${classId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const candidates = data?.candidates ?? [];
  const emptyMessage =
    data && data.totalFutureClasses === 0
      ? "Ningún otro instructor tiene clases programadas en las próximas semanas, así que no hay con qué intercambiar todavía. Considera “Pedir suplente” en su lugar."
      : "No encontramos clases con las que intercambiar ahora mismo (los demás instructores ya tienen clase a esta hora). Considera “Pedir suplente” en su lugar.";

  const mutation = useMutation({
    mutationFn: async (cand: SwapCandidate) => {
      const res = await fetch("/api/coach/substitutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          mode: "SWAP",
          targetCoachId: cand.coach.profileId,
          swapWithClassId: cand.classId,
          reasonType,
          reasonNote: reasonNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      return json;
    },
    onSuccess: onDone,
    onError: (e: Error) => setError(e.message),
  });

  const handlePick = (c: SwapCandidate) => {
    if (!reasonType) {
      setError("Selecciona un motivo primero");
      return;
    }
    setError(null);
    mutation.mutate(c);
  };

  return (
    <div className="space-y-4 px-5 py-4">
      <ReasonFields
        reasonType={reasonType}
        setReasonType={setReasonType}
        reasonNote={reasonNote}
        setReasonNote={setReasonNote}
      />

      <div>
        <label className="mb-2 block text-xs font-medium text-muted">
          Elige con qué clase quieres intercambiar
        </label>
        <p className="text-muted-foreground mb-2 text-[11px]">
          Tú das esta clase del otro coach, y ese coach da la tuya. Requiere confirmación del otro coach + admin.
        </p>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : candidates.length === 0 ? (
          <p className="text-muted text-sm">{emptyMessage}</p>
        ) : (
          <ul className="max-h-[320px] space-y-1.5 overflow-y-auto rounded-md border p-1">
            {candidates.map((c) => (
              <li key={c.classId}>
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => handlePick(c)}
                  className="hover:bg-muted/40 flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <UserAvatar user={{ name: c.coach.name, image: c.coach.image }} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.classTypeName}</div>
                      <div className="text-muted-foreground text-[11px] tabular-nums">
                        {format(new Date(c.startsAt), "EEE d MMM · HH:mm", { locale: es })}
                        {" · "}
                        {c.coach.name}
                        {" · "}
                        {c.studio.name}
                      </div>
                      <SwapWarnings candidate={c} />
                    </div>
                  </div>
                  <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
