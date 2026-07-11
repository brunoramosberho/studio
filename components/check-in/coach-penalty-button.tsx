"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useCurrency } from "@/components/tenant-provider";

type PenaltyType = "LATE_ARRIVAL" | "LATE_ENDING" | "OTHER";

const TYPE_OPTIONS: { value: PenaltyType; label: string }[] = [
  { value: "LATE_ARRIVAL", label: "Llegó tarde" },
  { value: "LATE_ENDING", label: "Terminó tarde" },
  { value: "OTHER", label: "Otro (escribir)" },
];

export function CoachPenaltyButton({
  classId,
  coachName,
}: {
  classId: string;
  coachName: string | null;
}) {
  const currency = useCurrency();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PenaltyType>("LATE_ARRIVAL");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setType("LATE_ARRIVAL");
    setNote("");
    setAmount("");
  };

  const submit = async () => {
    if (type === "OTHER" && !note.trim()) {
      toast.error("Describe la penalidad en la nota");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/coach-penalties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          type,
          note: note.trim() || null,
          amountCents: amount.trim() ? Math.round(parseFloat(amount) * 100) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "No se pudo registrar la penalidad");
        return;
      }
      toast.success("Penalidad registrada");
      setOpen(false);
      reset();
    } catch {
      toast.error("No se pudo registrar la penalidad");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300/70 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        title="Registrar una penalidad para el instructor"
      >
        <AlertTriangle className="h-3 w-3" />
        Penalidad
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Penalidad{coachName ? ` · ${coachName}` : ""}
            </DialogTitle>
            <DialogDescription>
              Queda registrada en el perfil del instructor y en sus pagos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-xs">Motivo</Label>
              <div className="flex flex-col gap-1.5">
                {TYPE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setType(o.value)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      type === o.value
                        ? "border-admin bg-admin/10 font-medium text-foreground"
                        : "border-border text-muted hover:bg-surface"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs">
                Nota {type === "OTHER" ? "(requerida)" : "(opcional)"}
              </Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={
                  type === "OTHER" ? "Describe la penalidad…" : "Detalle (opcional)"
                }
              />
            </div>

            <div>
              <Label className="mb-1 block text-xs">
                Monto ({currency.symbol}) — opcional
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Solo si aplica"
              />
              <p className="mt-1 text-[11px] text-muted">
                Se registra; no se descuenta del pago automáticamente.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={submitting}
              className="bg-admin text-white hover:bg-admin/90"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
