"use client";

// Wellhub payment advance — admin-facing card.
//   variant="full"    → Finance: breakdown + request CTA + history ledger.
//   variant="compact" → Dashboard: available-now teaser or request-access CTA.
// Hidden entirely when the tenant doesn't run the Wellhub API integration.

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Loader2, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { validatePayoutAccount } from "@/lib/banking/validate";

interface AdvanceData {
  eligible: boolean;
  access?: "disabled" | "requested" | "enabled";
  payout?: { method: string; accountMasked: string; holder: string | null } | null;
  window?: { open: boolean; period: string; localDay: number };
  available?: {
    counts: { checkins: number; noShows: number; lateCancels: number };
    grossCents: number;
    feeCents: number;
    vatCents: number;
    netCents: number;
    feePercent: number;
    vatPercent: number;
    drawnGrossCents: number;
  } | null;
  history?: {
    id: string;
    period: string;
    status: "requested" | "approved" | "paid" | "settled" | "rejected" | "cancelled";
    checkins: number;
    noShows: number;
    lateCancels: number;
    netCents: number;
    currency: string;
    requestedAt: string;
  }[];
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  requested: { label: "Solicitado", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  approved: { label: "Aprobado", className: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  paid: { label: "Pagado", className: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400" },
  settled: { label: "Liquidado", className: "bg-stone-100 text-stone-600 dark:bg-surface dark:text-muted" },
  rejected: { label: "Rechazado", className: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
  cancelled: { label: "Cancelado", className: "bg-stone-100 text-stone-500 dark:bg-surface dark:text-muted" },
};

function money(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

export function WellhubAdvanceCard({ variant }: { variant: "full" | "compact" }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Bank account entry — needed the first time (or when changing accounts).
  const [editingPayout, setEditingPayout] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<"iban" | "clabe">("iban");
  const [payoutAccount, setPayoutAccount] = useState("");
  const [payoutHolder, setPayoutHolder] = useState("");
  const [payoutError, setPayoutError] = useState<string | null>(null);

  const { data } = useQuery<AdvanceData>({
    queryKey: ["wellhub-advance"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/wellhub/advance");
      if (!res.ok) return { eligible: false };
      return res.json();
    },
    staleTime: 60_000,
  });

  const requestAccess = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/platforms/wellhub/advance/request-access", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellhub-advance"] });
      toast.success("Solicitud enviada — te avisaremos cuando esté habilitado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestDraw = useMutation({
    mutationFn: async () => {
      // Client-side checksum first — instant feedback, no round-trip. The
      // server re-validates regardless.
      const needsAccount = !data?.payout || editingPayout;
      let body: Record<string, string> | undefined;
      if (needsAccount) {
        const check = validatePayoutAccount(payoutMethod, payoutAccount);
        if (!check.valid) throw new Error(check.error ?? "Cuenta inválida");
        if (payoutHolder.trim().length < 3) throw new Error("Falta el nombre del titular");
        body = { payoutMethod, payoutAccount, payoutHolder: payoutHolder.trim() };
      }
      const res = await fetch("/api/platforms/wellhub/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellhub-advance"] });
      setConfirmOpen(false);
      setEditingPayout(false);
      setPayoutError(null);
      toast.success("Adelanto solicitado — recibirás la transferencia al aprobarse");
    },
    onError: (e: Error) => {
      setPayoutError(e.message);
      toast.error(e.message);
    },
  });

  if (!data?.eligible) return null;

  const access = data.access ?? "disabled";
  const win = data.window;
  const avail = data.available;
  const history = data.history ?? [];
  const totalEvents = avail
    ? avail.counts.checkins + avail.counts.noShows + avail.counts.lateCancels
    : 0;
  const canDraw = access === "enabled" && !!win?.open && !!avail && avail.netCents > 0 && totalEvents > 0;

  // ── Compact (dashboard) ───────────────────────────────────────────────────
  if (variant === "compact") {
    // Only surface when there's something to do: money to draw, or access to request.
    if (access === "enabled" && !canDraw) return null;
    if (access === "requested") return null;

    return (
      <Card className="border-l-4 border-l-[#E4572E]">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E4572E]/10">
            <Banknote className="h-4.5 w-4.5 text-[#E4572E]" />
          </div>
          <div className="min-w-0 flex-1">
            {access === "enabled" && avail ? (
              <>
                <p className="text-sm font-semibold">
                  Tienes {money(avail.netCents)} de Wellhub listos para adelantar
                </p>
                <p className="text-xs text-muted">
                  {totalEvents} eventos del periodo · sin esperar al pago del día 15
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Adelanto de pagos Wellhub</p>
                <p className="text-xs text-muted">
                  Cobra tus check-ins acumulados sin esperar al pago del día 15
                </p>
              </>
            )}
          </div>
          {access === "enabled" ? (
            <Link href="/admin/finance#wellhub-advance">
              <Button size="sm" className="gap-1 bg-admin hover:bg-admin/90">
                Ver en Finanzas
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => requestAccess.mutate()}
              disabled={requestAccess.isPending}
            >
              {requestAccess.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Solicitar acceso
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Full (finance) ────────────────────────────────────────────────────────
  return (
    <Card id="wellhub-advance" className="scroll-mt-24">
      <CardContent className="p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-[#E4572E]" />
            <span className="text-sm font-semibold">Adelanto de pagos Wellhub</span>
          </div>
          {win && (
            <Badge variant="secondary" className="text-[10px]">
              Periodo {win.period}
            </Badge>
          )}
        </div>
        <p className="mb-4 text-xs text-muted">
          Adelanta los check-ins, no-shows y cancelaciones tardías ya acumulados, sin esperar el
          pago de Wellhub (~día 15). Disponible del día 20 al 7 del mes siguiente. El remanente del
          periodo se te transfiere íntegro cuando Wellhub liquida.
        </p>

        {access !== "enabled" ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            {access === "requested" ? (
              <p className="text-sm text-muted">
                Solicitud enviada ✓ — te avisaremos cuando el adelanto esté habilitado para tu
                estudio.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">
                  Esta función requiere activación. Solicita acceso y el equipo de Magic lo revisa.
                </p>
                <Button
                  size="sm"
                  onClick={() => requestAccess.mutate()}
                  disabled={requestAccess.isPending}
                  className="bg-admin hover:bg-admin/90"
                >
                  {requestAccess.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Solicitar acceso
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            {avail && (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-stone-50 p-3 dark:bg-surface/40">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Acumulado</p>
                  <p className="mt-0.5 font-mono text-lg font-bold">{money(avail.grossCents)}</p>
                  <p className="text-[10px] text-muted">
                    {avail.counts.checkins} check-ins · {avail.counts.noShows} no-show ·{" "}
                    {avail.counts.lateCancels} late
                  </p>
                </div>
                <div className="rounded-lg bg-stone-50 p-3 dark:bg-surface/40">
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    Comisión {avail.feePercent}%
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-stone-500">
                    −{money(avail.feeCents)}
                  </p>
                </div>
                <div className="rounded-lg bg-stone-50 p-3 dark:bg-surface/40">
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    IVA {avail.vatPercent}% (s/comisión)
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-stone-500">
                    −{money(avail.vatCents)}
                  </p>
                </div>
                <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950/30">
                  <p className="text-[10px] uppercase tracking-wide text-green-700 dark:text-green-400">
                    Recibirías
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-green-700 dark:text-green-400">
                    {money(avail.netCents)}
                  </p>
                </div>
              </div>
            )}

            <div className="mb-4 flex items-center gap-3">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!canDraw}
                className="bg-admin hover:bg-admin/90"
              >
                Solicitar adelanto
              </Button>
              {!win?.open && (
                <p className="text-xs text-muted">
                  La ventana abre el día 20 y cierra el día 7 del mes siguiente.
                </p>
              )}
              {win?.open && avail && avail.netCents <= 0 && (
                <p className="text-xs text-muted">No hay eventos nuevos por adelantar.</p>
              )}
            </div>
          </>
        )}

        {history.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">
              Historial
            </p>
            <div className="space-y-1.5">
              {history.map((a) => {
                const s = STATUS_LABEL[a.status] ?? STATUS_LABEL.requested;
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {money(a.netCents, a.currency)}
                        <span className="ml-2 text-xs font-normal text-muted">
                          {a.checkins + a.noShows + a.lateCancels} eventos · periodo {a.period}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted">
                        Solicitado {format(new Date(a.requestedAt), "d MMM yyyy HH:mm", { locale: es })}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.className}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>

      {/* Confirm dialog — money moves on the back of this request. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar adelanto</DialogTitle>
          </DialogHeader>
          {avail && (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Acumulado ({totalEvents} eventos)</span>
                <span className="font-mono">{money(avail.grossCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Comisión {avail.feePercent}%</span>
                <span className="font-mono">−{money(avail.feeCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">IVA {avail.vatPercent}%</span>
                <span className="font-mono">−{money(avail.vatCents)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
                <span>Recibirás</span>
                <span className="font-mono text-green-700 dark:text-green-400">
                  {money(avail.netCents)}
                </span>
              </div>
              {/* Destination account: stored (masked, with change option) or asked
                  for the first time — checksum-validated before sending. */}
              <div className="mt-2 border-t pt-3">
                {data?.payout && !editingPayout ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted">
                        Cuenta de depósito
                      </p>
                      <p className="font-mono text-xs">
                        {data.payout.method.toUpperCase()} {data.payout.accountMasked}
                        {data.payout.holder ? ` · ${data.payout.holder}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => setEditingPayout(true)}
                    >
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      Cuenta para recibir el adelanto
                    </p>
                    <div className="flex gap-1.5">
                      {(["iban", "clabe"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => { setPayoutMethod(m); setPayoutError(null); }}
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                            payoutMethod === m
                              ? "border-admin bg-admin/10 text-admin"
                              : "text-muted"
                          }`}
                        >
                          {m === "iban" ? "IBAN (Europa)" : "CLABE (México)"}
                        </button>
                      ))}
                    </div>
                    <Input
                      placeholder={payoutMethod === "iban" ? "ES91 2100 0418 45…" : "18 dígitos"}
                      value={payoutAccount}
                      onChange={(e) => { setPayoutAccount(e.target.value); setPayoutError(null); }}
                      className="font-mono text-sm"
                    />
                    <Input
                      placeholder="Titular de la cuenta"
                      value={payoutHolder}
                      onChange={(e) => { setPayoutHolder(e.target.value); setPayoutError(null); }}
                      className="text-sm"
                    />
                    {payoutError && <p className="text-xs text-red-600">{payoutError}</p>}
                  </div>
                )}
              </div>
              <p className="pt-1 text-xs text-muted">
                La transferencia se realiza al aprobarse la solicitud. Los eventos incluidos quedan
                registrados y el remanente del periodo se liquida cuando pague Wellhub.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-admin hover:bg-admin/90"
              onClick={() => requestDraw.mutate()}
              disabled={requestDraw.isPending}
            >
              {requestDraw.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Confirmar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
