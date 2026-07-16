"use client";

// Super-admin controls for the Wellhub payment-advance feature of ONE tenant:
// grant/revoke access, set fee% + VAT%, and work the draw queue
// (approve → transfer manually → mark paid → settle when Wellhub pays).

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface AdvanceRow {
  id: string;
  tenantId: string;
  period: string;
  status: "requested" | "approved" | "paid" | "settled" | "rejected" | "cancelled";
  checkins: number;
  noShows: number;
  lateCancels: number;
  grossCents: number;
  feeCents: number;
  vatCents: number;
  netCents: number;
  currency: string;
  payoutMethod: string | null;
  payoutAccount: string | null;
  payoutHolder: string | null;
  requestedAt: string;
}

interface ConfigRow {
  tenantId: string;
  access: "disabled" | "requested" | "enabled";
  feePercent: number;
  vatPercent: number;
  requestedAt: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  settled: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

function money(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

export function WellhubAdvanceAdmin({ tenantId }: { tenantId: string }) {
  const [config, setConfig] = useState<ConfigRow | null>(null);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fee, setFee] = useState("");
  const [vat, setVat] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/super-admin/wellhub-advances");
    if (!res.ok) return;
    const data = await res.json();
    const cfg = (data.configs as ConfigRow[]).find((c) => c.tenantId === tenantId) ?? null;
    setConfig(cfg);
    setFee(cfg ? String(cfg.feePercent) : "2.35");
    setVat(cfg ? String(cfg.vatPercent) : "16");
    setAdvances((data.advances as AdvanceRow[]).filter((a) => a.tenantId === tenantId));
    setLoaded(true);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>, okMsg: string) {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/super-admin/wellhub-advances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      setMsg(okMsg);
      await load();
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  const access = config?.access ?? "disabled";

  return (
    <Card className="border border-gray-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Adelanto de pagos Wellhub
          <Badge className={STATUS_BADGE[access === "enabled" ? "paid" : access === "requested" ? "requested" : "cancelled"]}>
            {access === "enabled" ? "Habilitado" : access === "requested" ? "Solicitado" : "Deshabilitado"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Access + pricing */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Comisión %</label>
            <Input value={fee} onChange={(e) => setFee(e.target.value)} className="w-24" type="number" step="0.01" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">IVA % (s/comisión)</label>
            <Input value={vat} onChange={(e) => setVat(e.target.value)} className="w-24" type="number" step="0.01" />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() =>
              patch(
                { kind: "config", tenantId, feePercent: Number(fee), vatPercent: Number(vat) },
                "✓ Condiciones guardadas",
              )
            }
          >
            Guardar condiciones
          </Button>
          {access !== "enabled" ? (
            <Button
              size="sm"
              disabled={saving}
              onClick={() => patch({ kind: "config", tenantId, access: "enabled" }, "✓ Acceso habilitado")}
            >
              Habilitar acceso
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => patch({ kind: "config", tenantId, access: "disabled" }, "Acceso deshabilitado")}
            >
              Deshabilitar
            </Button>
          )}
        </div>
        {msg && <p className="text-xs text-gray-500">{msg}</p>}

        {/* Draw queue */}
        {advances.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Adelantos</p>
            {advances.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-100 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {money(a.netCents, a.currency)}{" "}
                    <span className="font-normal text-gray-400">
                      neto · bruto {money(a.grossCents, a.currency)} · fee {money(a.feeCents, a.currency)} + IVA {money(a.vatCents, a.currency)}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Periodo {a.period} · {a.checkins} check-ins, {a.noShows} no-shows, {a.lateCancels} late-cancels ·{" "}
                    {new Date(a.requestedAt).toLocaleString("es-ES")}
                  </p>
                  {a.payoutAccount && (
                    <p className="mt-0.5 font-mono text-xs text-gray-700">
                      {(a.payoutMethod ?? "").toUpperCase()}: {a.payoutAccount}
                      {a.payoutHolder ? ` · ${a.payoutHolder}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className={STATUS_BADGE[a.status]}>{a.status}</Badge>
                  {a.status === "requested" && (
                    <>
                      <Button size="sm" disabled={saving} onClick={() => patch({ kind: "advance", advanceId: a.id, action: "approve" }, "✓ Aprobado")}>
                        Aprobar
                      </Button>
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => patch({ kind: "advance", advanceId: a.id, action: "reject" }, "Rechazado — eventos liberados")}>
                        Rechazar
                      </Button>
                    </>
                  )}
                  {a.status === "approved" && (
                    <Button size="sm" disabled={saving} onClick={() => patch({ kind: "advance", advanceId: a.id, action: "paid" }, "✓ Marcado pagado")}>
                      Marcar pagado
                    </Button>
                  )}
                  {a.status === "paid" && (
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => patch({ kind: "advance", advanceId: a.id, action: "settled" }, "✓ Periodo liquidado")}>
                      Marcar liquidado
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
