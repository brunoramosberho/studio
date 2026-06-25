"use client";

// Wellhub API onboarding UI. Per-partner integration model:
//   - Each tenant pastes their own bearer token (issued by Wellhub directly
//     to the studio). Token is encrypted at rest.
//   - Webhook URLs + signing secret are surfaced for the admin to forward to
//     their Wellhub account manager. We do NOT subscribe webhooks
//     programmatically — Wellhub registers them on their side.

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Copy, Play } from "lucide-react";
import { toast } from "sonner";

type WellhubMode = "disabled" | "legacy_email" | "api";

interface WellhubConfig {
  id: string;
  wellhubGymId: number | null;
  wellhubMode: WellhubMode;
  wellhubLocale: string | null;
  wellhubAuthTokenSet: boolean;
  wellhubWebhookSecretSet: boolean;
  wellhubWebhooksRegistered: boolean;
  wellhubLastSyncAt: string | null;
  wellhubLastError: string | null;
  ratePerVisit: number | null;
  maxPayoutPerVisitor: number | null;
  noShowPercent: number | null;
  lateCancelPercent: number | null;
  freeVisitsPerMonth: number | null;
  wellhubDefaultQuota: number | null;
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
const WEBHOOK_EVENTS = [
  "booking-requested",
  "booking-canceled",
  "booking-late-canceled",
  "checkin-booking-occurred",
  "checkin",
];

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copiado`),
    () => toast.error("No se pudo copiar"),
  );
}

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
  const [tokenDraft, setTokenDraft] = useState<string>("");
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  // Commercial conditions draft (strings for inputs; percents shown 0..100).
  const [ccDraft, setCcDraft] = useState({
    ratePerVisit: "",
    maxPayoutPerVisitor: "",
    noShowPercent: "",
    lateCancelPercent: "",
    freeVisitsPerMonth: "",
  });
  // Seed the draft once the config loads (or changes).
  useEffect(() => {
    if (!config) return;
    setCcDraft({
      ratePerVisit: config.ratePerVisit != null ? String(config.ratePerVisit) : "",
      maxPayoutPerVisitor:
        config.maxPayoutPerVisitor != null ? String(config.maxPayoutPerVisitor) : "",
      noShowPercent:
        config.noShowPercent != null ? String(Math.round(config.noShowPercent * 100)) : "",
      lateCancelPercent:
        config.lateCancelPercent != null ? String(Math.round(config.lateCancelPercent * 100)) : "",
      freeVisitsPerMonth:
        config.freeVisitsPerMonth != null ? String(config.freeVisitsPerMonth) : "",
    });
  }, [config]);
  const [simSlotId, setSimSlotId] = useState<string>("");
  const [simClassId, setSimClassId] = useState<string>("");
  const [simUserId, setSimUserId] = useState<string>("1000000000002");
  const [simBookingNumber, setSimBookingNumber] = useState<string>("");
  const [simResult, setSimResult] = useState<unknown>(null);

  const saveConfig = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
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
      if (!res.ok && res.status !== 200) throw new Error(body.reason ?? "failed");
      return body as { ok: boolean; reason?: string; hint?: string; status?: number };
    },
    onSuccess: (body) => {
      if (body.ok) {
        toast.success("Conexión OK — el token tiene acceso al gym");
        return;
      }
      // Not-ok but well-understood reasons get friendly, actionable copy.
      const messages: Record<string, string> = {
        missing_token: "Falta el token. Pégalo en el Paso 1 y guárdalo.",
        missing_gym_id: "Falta el gym_id. Guárdalo en el Paso 1.",
        gym_not_authorized:
          "El token es válido pero Wellhub aún no habilitó el gym para estas credenciales. Vuelve a probar más tarde.",
        gym_not_found: "Wellhub no reconoce este gym_id. Verifícalo con tu contacto.",
      };
      toast.error(messages[body.reason ?? ""] ?? `Falló la conexión: ${body.reason ?? "desconocido"}`);
    },
    onError: (e: Error) => toast.error(`Falló la conexión: ${e.message}`),
  });

  const rotateSecret = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/platforms/wellhub/rotate-secret", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.reason ?? "failed");
      return body as { ok: true; secret: string };
    },
    onSuccess: (body) => {
      setFreshSecret(body.secret);
      toast.success("Secret generado — cópialo ahora, no se mostrará de nuevo");
      qc.invalidateQueries({ queryKey: ["wellhub-config"] });
    },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
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

  const simulate = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/platforms/wellhub/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? data.reason ?? "Simulación falló");
      }
      return data.result;
    },
    onSuccess: (result) => {
      setSimResult(result);
      toast.success("Webhook simulado disparado");
    },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
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
  const tokenSet = !!config?.wellhubAuthTokenSet;
  const secretSet = !!config?.wellhubWebhookSecretSet;
  const isApi = config?.wellhubMode === "api";

  // Webhook URLs are SHARED across all tenants — the handler resolves the
  // owning tenant by gym_id from the payload (not by subdomain). This means
  // Wellhub only needs the 5 URLs registered once at the CMS level; new
  // tenants just plug in their gym_id + secret without touching Wellhub's
  // URL list.
  const webhookHost =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host.split(".").slice(-2).join(".")}`
      : "https://mgic.app";
  const webhookUrls = WEBHOOK_EVENTS.map((event) => ({
    event,
    url: `${webhookHost}/api/webhooks/wellhub/${event}`,
  }));

  return (
    <div className="space-y-4">
      {/* Step 1 — Identity + Token */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>1. Identidad y credenciales</span>
            {gymIdSet && tokenSet && (
              <Badge variant="outline" className="bg-green-50">
                gym_id #{config?.wellhubGymId} · token configurado
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Gym ID</label>
            <p className="text-xs text-muted-foreground">
              Te lo entrega Wellhub al onboardear tu estudio (lo encuentras en
              tu Partner Portal o se lo pides a tu account manager).
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
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Auth Token (Bearer)</label>
            <p className="text-xs text-muted-foreground">
              Token del API issued por Wellhub a tu estudio. Se guarda
              encriptado. Sólo pégalo si vas a actualizarlo —
              {tokenSet ? " ya hay uno guardado." : " aún no hay ninguno."}
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={tokenSet ? "•••••••••••••• (dejar vacío para conservar)" : "Pega el token aquí"}
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                autoComplete="off"
              />
              <Button
                onClick={() => {
                  if (!tokenDraft) {
                    toast.error("Pega un token antes de guardar");
                    return;
                  }
                  saveConfig.mutate({ wellhubAuthToken: tokenDraft });
                  setTokenDraft("");
                }}
                disabled={saveConfig.isPending}
              >
                Guardar token
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testConnection.mutate()}
              disabled={!gymIdSet || !tokenSet || testConnection.isPending}
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

      {/* Step 2 — Webhooks (manual setup with Wellhub) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>2. Webhooks</span>
            {secretSet ? (
              <Badge variant="outline" className="bg-green-50">Secret generado</Badge>
            ) : (
              <Badge variant="outline">Sin secret</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Wellhub no expone API para suscribir webhooks: tu account manager
            los registra del lado de ellos. Las 5 URLs de abajo son las
            mismas para todos los estudios (Magic enruta cada webhook al
            tenant correcto usando el <code className="rounded bg-muted px-1">gym_id</code> del payload).
            Si Wellhub ya las tiene registradas a nivel de CMS, sólo necesitas
            mandar el secret para tu gym. El secret se valida por gym; cuando
            lo rotes, las llamadas en vuelo firmadas con el anterior fallarán
            hasta que Wellhub actualice.
          </p>

          <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium">URLs (compartidas — sólo necesitan registrarse 1 vez)</div>
            {webhookUrls.map(({ event, url }) => (
              <div key={event} className="flex items-center gap-2 font-mono text-xs">
                <span className="w-44 shrink-0 text-muted-foreground">{event}</span>
                <code className="flex-1 truncate rounded bg-background px-2 py-1">{url}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => copyToClipboard(url, event)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => rotateSecret.mutate()}
              disabled={!gymIdSet || rotateSecret.isPending}
            >
              {rotateSecret.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {secretSet ? "Rotar secret" : "Generar secret"}
            </Button>
            {secretSet && (
              <span className="text-xs text-muted-foreground">
                Hay un secret guardado. Rotar genera uno nuevo y descarta el anterior.
              </span>
            )}
          </div>

          {freshSecret && (
            <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-900">
                <AlertCircle className="h-3.5 w-3.5" /> Cópialo ahora — no se mostrará de nuevo
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
                  {freshSecret}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(freshSecret, "Secret")}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
              <p className="text-xs text-amber-800">
                Mándale este secret a tu account manager de Wellhub junto con las
                URLs de arriba. Firma esperada: HMAC-SHA1, header{" "}
                <code className="rounded bg-amber-100 px-1">x-gympass-signature</code>.
              </p>
            </div>
          )}
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
              disabled={!gymIdSet || !tokenSet || refreshProducts.isPending}
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

          {/* Commercial conditions — mirror the Wellhub contract so the
              liquidation estimate matches what Wellhub actually pays. */}
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium">Condiciones comerciales (de tu contrato Wellhub)</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>Pago por check-in (€)</span>
                <Input
                  type="number" step="0.01" className="w-28"
                  value={ccDraft.ratePerVisit}
                  onChange={(e) => setCcDraft((d) => ({ ...d, ratePerVisit: e.target.value }))}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>Máx. por visitante/mes (€)</span>
                <Input
                  type="number" step="0.01" className="w-28"
                  value={ccDraft.maxPayoutPerVisitor}
                  onChange={(e) => setCcDraft((d) => ({ ...d, maxPayoutPerVisitor: e.target.value }))}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>No-show (% del check-in)</span>
                <Input
                  type="number" step="1" min="0" max="100" className="w-28"
                  value={ccDraft.noShowPercent}
                  onChange={(e) => setCcDraft((d) => ({ ...d, noShowPercent: e.target.value }))}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>Cancelación tardía (%)</span>
                <Input
                  type="number" step="1" min="0" max="100" className="w-28"
                  value={ccDraft.lateCancelPercent}
                  onChange={(e) => setCcDraft((d) => ({ ...d, lateCancelPercent: e.target.value }))}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>Visitas gratis/mes</span>
                <Input
                  type="number" step="1" min="0" className="w-28"
                  value={ccDraft.freeVisitsPerMonth}
                  onChange={(e) => setCcDraft((d) => ({ ...d, freeVisitsPerMonth: e.target.value }))}
                />
              </label>
            </div>
            <Button
              size="sm"
              onClick={() => {
                const num = (s: string) => (s.trim() === "" ? null : Number(s));
                const pct = (s: string) => (s.trim() === "" ? null : Number(s) / 100);
                saveConfig.mutate({
                  ratePerVisit: num(ccDraft.ratePerVisit),
                  maxPayoutPerVisitor: num(ccDraft.maxPayoutPerVisitor),
                  noShowPercent: pct(ccDraft.noShowPercent),
                  lateCancelPercent: pct(ccDraft.lateCancelPercent),
                  freeVisitsPerMonth: num(ccDraft.freeVisitsPerMonth),
                });
              }}
              disabled={saveConfig.isPending}
            >
              Guardar condiciones
            </Button>
            <p className="text-xs text-muted-foreground">
              Para Be Toro: €15 check-in · €150 máx/mes · 70% no-show · 70% cancelación tardía · 0 gratis.
            </p>
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

          {/* Activation toggle — this is what flips the dashboard out of demo mode. */}
          <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                Integración {config?.isActive ? "activa" : "inactiva"}
                {config?.isActive ? (
                  <Badge variant="outline" className="bg-green-50">En vivo</Badge>
                ) : (
                  <Badge variant="outline">Apagada</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Mientras esté apagada, el panel muestra datos de ejemplo (modo demo).
                Actívala cuando hayas mapeado clases, puesto cupos y hecho el backfill.
              </p>
            </div>
            <Button
              size="sm"
              variant={config?.isActive ? "outline" : "default"}
              onClick={() => saveConfig.mutate({ isActive: !config?.isActive })}
              disabled={!isApi || !gymIdSet || !tokenSet || saveConfig.isPending}
            >
              {config?.isActive ? "Desactivar" : "Activar integración"}
            </Button>
          </div>

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

      {/* Step 5 — Webhook simulations (sandbox only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>5. Probar webhooks (sandbox)</span>
            <Badge variant="outline">Sandbox only</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Dispara webhooks reales contra tus endpoints sin necesitar un usuario
            de Wellhub. Usa los IDs de slot/class del catálogo de sandbox.
          </p>

          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium">booking-requested</div>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="slot_id"
                className="w-32"
                value={simSlotId}
                onChange={(e) => setSimSlotId(e.target.value)}
              />
              <Input
                placeholder="class_id"
                className="w-32"
                value={simClassId}
                onChange={(e) => setSimClassId(e.target.value)}
              />
              <Input
                placeholder="gympass_user_id"
                className="w-48"
                value={simUserId}
                onChange={(e) => setSimUserId(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  simulate.mutate({
                    action: "booking-requested",
                    slotId: Number(simSlotId),
                    classId: Number(simClassId),
                    gympassUserId: simUserId,
                  })
                }
                disabled={!simSlotId || !simClassId || !simUserId || simulate.isPending}
              >
                {simulate.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                Disparar
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium">booking-canceled / late-canceled</div>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="booking_number (ej. BK_XXXXX)"
                className="w-56"
                value={simBookingNumber}
                onChange={(e) => setSimBookingNumber(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  simulate.mutate({
                    action: "booking-cancel",
                    bookingNumber: simBookingNumber,
                  })
                }
                disabled={!simBookingNumber || simulate.isPending}
              >
                Cancel normal
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  simulate.mutate({
                    action: "booking-cancel",
                    bookingNumber: simBookingNumber,
                    late: true,
                  })
                }
                disabled={!simBookingNumber || simulate.isPending}
              >
                Late cancel
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium">checkin</div>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="gympass_user_id"
                className="w-48"
                value={simUserId}
                onChange={(e) => setSimUserId(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  simulate.mutate({
                    action: "checkin",
                    gympassUserId: simUserId,
                  })
                }
                disabled={!simUserId || simulate.isPending}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" /> Disparar check-in
              </Button>
            </div>
          </div>

          {simResult !== null && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Última respuesta</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSimResult(null)}
                >
                  Limpiar
                </Button>
              </div>
              <pre className="max-h-64 overflow-auto rounded bg-background p-2 font-mono text-xs">
                {JSON.stringify(simResult, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
