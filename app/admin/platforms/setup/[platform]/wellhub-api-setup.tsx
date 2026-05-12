"use client";

// Wellhub API onboarding UI. Replaces the legacy email-parsing flow with a
// step-by-step setup that drives the Booking + Access Control + Setup APIs.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type WellhubMode = "disabled" | "legacy_email" | "api";
type ImplMethod = "attendance_trigger" | "gate_trigger";

interface WellhubConfig {
  id: string;
  wellhubGymId: number | null;
  wellhubMode: WellhubMode;
  wellhubImplMethod: ImplMethod;
  wellhubLocale: string | null;
  wellhubWebhookSecretSet: boolean;
  wellhubWebhooksRegistered: boolean;
  wellhubLastSyncAt: string | null;
  wellhubLastError: string | null;
  ratePerVisit: number | null;
  portalUrl: string | null;
  isActive: boolean;
}

interface WellhubProduct {
  id: string;
  productId: number;
  name: string;
  virtual: boolean;
}

interface ClassTypeMapping {
  id: string;
  name: string;
  wellhubProductId: number | null;
  wellhubClassId: number | null;
}

const LOCALES = ["es", "es_MX", "es_AR", "es_CL", "en", "pt", "en_GB", "de", "fr", "it", "nl"];

export function WellhubApiSetup() {
  const qc = useQueryClient();

  const { data: config } = useQuery<WellhubConfig | null>({
    queryKey: ["wellhub-config"],
    queryFn: async () => (await fetch("/api/platforms/wellhub/config")).json(),
  });

  const { data: products = [] } = useQuery<WellhubProduct[]>({
    queryKey: ["wellhub-products"],
    queryFn: async () => (await fetch("/api/platforms/wellhub/products")).json(),
  });

  const { data: classTypes = [] } = useQuery<ClassTypeMapping[]>({
    queryKey: ["wellhub-classtypes"],
    queryFn: async () => (await fetch("/api/class-types")).json(),
  });

  const [gymIdDraft, setGymIdDraft] = useState<string>("");
  const [localeDraft, setLocaleDraft] = useState<string>("es");
  const [rateDraft, setRateDraft] = useState<string>("");

  const saveConfig = useMutation({
    mutationFn: async (patch: Partial<WellhubConfig>) => {
      const res = await fetch("/api/platforms/wellhub/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wellhub-config"] }),
  });

  const testConnection = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/platforms/wellhub/test-connection", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.reason ?? "failed");
      return body;
    },
    onSuccess: () => toast.success("Conexión OK con Wellhub"),
    onError: (e: Error) => toast.error(`Falló la conexión: ${e.message}`),
  });

  const registerWebhooks = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/platforms/wellhub/register-webhooks", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.reason ?? "failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Webhooks suscritos en Wellhub");
      qc.invalidateQueries({ queryKey: ["wellhub-config"] });
    },
    onError: (e: Error) => toast.error(`Falló la suscripción: ${e.message}`),
  });

  const refreshProducts = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/platforms/wellhub/products", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.reason ?? "failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Catálogo de productos actualizado");
      qc.invalidateQueries({ queryKey: ["wellhub-products"] });
    },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  });

  const mapClassType = useMutation({
    mutationFn: async (args: { id: string; wellhubProductId: number | null }) => {
      const res = await fetch(`/api/platforms/wellhub/class-types/${args.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wellhubProductId: args.wellhubProductId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wellhub-classtypes"] }),
  });

  const backfill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/platforms/wellhub/backfill?days=28", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.reason ?? "failed");
      return body;
    },
    onSuccess: (r) =>
      toast.success(
        `Backfill listo — sincronizadas: ${r.synced}, excluidas: ${r.excluded}, errores: ${r.errors}`,
      ),
    onError: (e: Error) => toast.error(`Error en backfill: ${e.message}`),
  });

  const gymIdSet = !!config?.wellhubGymId;
  const isApi = config?.wellhubMode === "api";

  return (
    <div className="space-y-4">
      {/* Step 1 — Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>1. Identidad del gym</span>
            {gymIdSet && <Badge variant="outline" className="bg-green-50">gym_id #{config?.wellhubGymId}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            El `gym_id` te lo entrega Wellhub al onboardear tu estudio. Si lo
            tienes, pégalo abajo. Si no, contacta a tu account manager.
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="123456"
              value={gymIdDraft || (config?.wellhubGymId ?? "")}
              onChange={(e) => setGymIdDraft(e.target.value)}
            />
            <select
              className="rounded-md border border-input bg-background px-3 text-sm"
              value={localeDraft || config?.wellhubLocale || "es"}
              onChange={(e) => setLocaleDraft(e.target.value)}
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <Button
              onClick={() =>
                saveConfig.mutate({
                  wellhubGymId: gymIdDraft ? Number(gymIdDraft) : (config?.wellhubGymId ?? null),
                  wellhubLocale: localeDraft || (config?.wellhubLocale ?? "es"),
                })
              }
              disabled={saveConfig.isPending}
            >
              Guardar
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testConnection.mutate()}
              disabled={!gymIdSet || testConnection.isPending}
            >
              {testConnection.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Probar conexión
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>2. Webhooks</span>
            {config?.wellhubWebhooksRegistered ? (
              <Badge variant="outline" className="bg-green-50">Suscritos</Badge>
            ) : (
              <Badge variant="outline">Pendiente</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Suscribiremos los 5 eventos (booking-requested, booking-canceled,
            booking-late-canceled, checkin-booking-occurred, checkin) en Wellhub
            apuntando a tu app. Al volver a hacer click rotamos el secret.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => registerWebhooks.mutate()}
            disabled={!gymIdSet || registerWebhooks.isPending}
          >
            {registerWebhooks.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {config?.wellhubWebhooksRegistered ? "Re-suscribir / rotar secret" : "Suscribir webhooks"}
          </Button>
        </CardContent>
      </Card>

      {/* Step 3 — Product mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>3. Mapeo de disciplinas → productos Wellhub</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refreshProducts.mutate()}
              disabled={!gymIdSet || refreshProducts.isPending}
            >
              {refreshProducts.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {products.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aún no hay productos en cache. Pulsa el botón de refrescar.
            </p>
          ) : (
            <div className="space-y-2">
              {classTypes.map((ct) => (
                <div key={ct.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{ct.name}</span>
                  <select
                    className="w-64 rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={ct.wellhubProductId ?? ""}
                    onChange={(e) =>
                      mapClassType.mutate({
                        id: ct.id,
                        wellhubProductId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">— Sin mapear —</option>
                    {products.map((p) => (
                      <option key={p.productId} value={p.productId}>
                        {p.name} {p.virtual ? "(virtual)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 4 — Mode + backfill */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>4. Activar y sincronizar</span>
            {isApi && <Badge variant="outline" className="bg-green-50">Modo API</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">Modo:</span>
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              value={config?.wellhubMode ?? "disabled"}
              onChange={(e) =>
                saveConfig.mutate({ wellhubMode: e.target.value as WellhubMode })
              }
            >
              <option value="disabled">Desactivado</option>
              <option value="api">API (push schedule + webhooks)</option>
              <option value="legacy_email">Email (modo legado)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm">Método de check-in:</span>
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              value={config?.wellhubImplMethod ?? "attendance_trigger"}
              onChange={(e) =>
                saveConfig.mutate({ wellhubImplMethod: e.target.value as ImplMethod })
              }
            >
              <option value="attendance_trigger">Attendance Trigger (recomendado)</option>
              <option value="gate_trigger">Gate Trigger (torniquete)</option>
            </select>
            <span className="text-xs text-muted-foreground">
              + Automated Trigger (siempre activo)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm">Pago por visita (EUR):</span>
            <Input
              type="number"
              step="0.01"
              className="w-32"
              value={rateDraft || (config?.ratePerVisit ?? "")}
              onChange={(e) => setRateDraft(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() =>
                saveConfig.mutate({ ratePerVisit: rateDraft ? Number(rateDraft) : null })
              }
              disabled={saveConfig.isPending}
            >
              Guardar
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={() => backfill.mutate()}
            disabled={!isApi || backfill.isPending}
          >
            {backfill.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar próximas 4 semanas
          </Button>

          {config?.wellhubLastError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-800">Último error</p>
                <p className="text-xs text-red-700">{config.wellhubLastError}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
