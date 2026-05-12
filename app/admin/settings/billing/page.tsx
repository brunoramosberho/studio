"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  CreditCard,
  Zap,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { useCurrency } from "@/components/tenant-provider";

interface ConnectStatus {
  status: "not_connected" | "pending" | "active" | "restricted";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCount: number;
}

interface SaaSPlanRow {
  planKey: string;
  name: string;
  currency: string;
  amountCents: number | null;
  countryCode: string;
  fromEnvFallback: boolean;
}

export default function BillingPage() {
  const tenantCurrency = useCurrency();
  const [saasPlans, setSaasPlans] = useState<SaaSPlanRow[]>([]);
  const [stripeSandboxMode, setStripeSandboxMode] = useState(false);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, plansRes] = await Promise.all([
        fetch("/api/stripe/connect/status"),
        fetch("/api/stripe/plans"),
      ]);
      if (statusRes.ok) {
        setConnectStatus(await statusRes.json());
      }
      if (plansRes.ok) {
        const data = await plansRes.json();
        setSaasPlans(Array.isArray(data.plans) ? data.plans : []);
        setStripeSandboxMode(Boolean(data.stripeSandboxMode));
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // If returning from Stripe onboarding, refresh status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true" || params.get("refresh") === "true") {
      loadStatus();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadStatus]);

  async function startOnboarding() {
    setOnboarding(true);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setOnboarding(false);
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/billing-portal", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silently fail
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Facturación & Pagos
        </h1>
        <p className="mt-1 text-sm text-muted">
          Gestiona tu suscripción y cuenta de pagos
        </p>
      </div>

      {stripeSandboxMode && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">Modo prueba Stripe.</span> Este estudio
          usa claves de test (`pk_test` / `sk_test`). Los cobros no son reales.
          Super-admin puede desactivarlo en el tenant cuando paséis a producción.
        </div>
      )}

      {/* ── SaaS Subscription Section ── */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-admin/10">
            <Zap className="h-5 w-5 text-admin" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Tu plan Mgic Studio
            </h2>
            <p className="text-xs text-muted">
              Gestiona tu suscripción a la plataforma
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface/50 p-4 space-y-3">
          {saasPlans.length > 0 ? (
            <ul className="space-y-2">
              {saasPlans.map((p) => (
                <li
                  key={`${p.planKey}-${p.countryCode}-${p.fromEnvFallback}`}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span className="font-medium text-foreground">{p.name}</span>
                  <span className="text-muted tabular-nums">
                    {p.amountCents != null
                      ? formatMoney(
                          p.amountCents / 100,
                          tenantCurrency,
                          p.currency.toUpperCase(),
                        )
                      : "—"}
                  </span>
                  {p.fromEnvFallback && (
                    <span className="flex w-full items-center gap-1 text-xs text-amber-700">
                      <Globe className="h-3 w-3 shrink-0" />
                      Precio desde variables de entorno (sin fila en base de
                      datos)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              No hay planes configurados en la base de datos ni en variables de
              entorno. Añade filas en la tabla{" "}
              <code className="rounded bg-muted px-1">saas_plans</code> o define{" "}
              <code className="rounded bg-muted px-1">STRIPE_PRICE_*</code>.
            </p>
          )}
          <p className="text-sm text-muted">
            Contacta al equipo de Mgic para activar tu plan.
          </p>
          <button
            onClick={openBillingPortal}
            disabled={portalLoading}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50"
          >
            {portalLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Gestionar suscripción
          </button>
        </div>
      </section>

      {/* ── Stripe Connect Section ── */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-admin/10">
            <CreditCard className="h-5 w-5 text-admin" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Cuenta de pagos (Stripe)
            </h2>
            <p className="text-xs text-muted">
              Recibe los pagos de tus alumnos directamente
            </p>
          </div>
        </div>

        {connectStatus?.status === "not_connected" && (
          <div className="rounded-lg border border-border/60 bg-surface/50 p-4">
            <p className="text-sm text-foreground">
              Conecta tu cuenta de Stripe para recibir los pagos de tus alumnos
              directamente en tu cuenta bancaria.
            </p>
            <button
              onClick={startOnboarding}
              disabled={onboarding}
              className={cn(
                "mt-3 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-all",
                "bg-[#635BFF] hover:bg-[#5851db] disabled:opacity-50",
              )}
            >
              {onboarding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Conectar con Stripe
            </button>
            <p className="mt-2 text-xs text-muted">
              También puedes crear una cuenta nueva si no tienes Stripe. Stripe
              gestionará la verificación de identidad.
            </p>
          </div>
        )}

        {connectStatus?.status === "pending" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <p className="text-sm font-medium text-amber-800">
                Tu cuenta de Stripe está siendo verificada
              </p>
            </div>
            {connectStatus.requirementsCount > 0 && (
              <p className="mt-1 text-xs text-amber-700">
                Acciones pendientes: {connectStatus.requirementsCount}
              </p>
            )}
            <button
              onClick={startOnboarding}
              disabled={onboarding}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-card px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
            >
              {onboarding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Completar verificación
            </button>
          </div>
        )}

        {connectStatus?.status === "restricted" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <p className="text-sm font-medium text-red-800">
                Tu cuenta de Stripe tiene restricciones
              </p>
            </div>
            {connectStatus.requirementsCount > 0 && (
              <p className="mt-1 text-xs text-red-700">
                Requisitos pendientes: {connectStatus.requirementsCount}
              </p>
            )}
            <button
              onClick={startOnboarding}
              disabled={onboarding}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-card px-4 py-2 text-sm font-medium text-red-800 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              {onboarding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Resolver requisitos
            </button>
          </div>
        )}

        {connectStatus?.status === "active" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-800">
                Cuenta de Stripe conectada y activa
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {connectStatus.chargesEnabled && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  Cobros activos
                </span>
              )}
              {connectStatus.payoutsEnabled && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  Transferencias activas
                </span>
              )}
            </div>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-card px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-50"
            >
              <ExternalLink className="h-4 w-4" />
              Ver en Stripe
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
