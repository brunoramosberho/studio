"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Infinity as InfinityIcon,
  ArrowRight,
  CalendarSync,
  ChevronLeft,
  Loader2,
  Pause,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PageTransition } from "@/components/shared/page-transition";
import { SubscribeSheet } from "@/components/checkout/SubscribeSheet";
import { formatCurrency } from "@/lib/utils";
import type { UserPackageWithDetails } from "@/types";

interface MemberSub {
  id: string;
  stripeSubscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  pausedAt: string | null;
  resumesAt: string | null;
  package: {
    id: string;
    name: string;
    price: number;
    currency: string;
    recurringInterval: string | null;
    credits: number | null;
  };
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

function daysUntil(date: Date | string): number {
  const diff = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

const STATUS_LABEL: Record<string, { text: string; variant: "success" | "warning" | "secondary" | "danger" }> = {
  active: { text: "Activa", variant: "success" },
  past_due: { text: "Pago pendiente", variant: "warning" },
  paused: { text: "Pausada", variant: "secondary" },
  canceled: { text: "Cancelada", variant: "danger" },
  trialing: { text: "Prueba", variant: "success" },
};

export default function PackagesPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<UserPackageWithDetails[]>([]);
  const [subscriptions, setSubscriptions] = useState<MemberSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [renewSub, setRenewSub] = useState<MemberSub | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/packages/mine").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/stripe/member-subscription").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([pkgs, subs]) => {
        setPackages(pkgs);
        setSubscriptions(subs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCancel(sub: MemberSub) {
    if (!confirm("¿Cancelar suscripción? Seguirás teniendo acceso hasta el fin del periodo actual.")) return;
    setCancelingId(sub.stripeSubscriptionId);
    try {
      const res = await fetch("/api/stripe/member-subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: sub.stripeSubscriptionId }),
      });
      if (res.ok) {
        setSubscriptions((prev) =>
          prev.map((s) =>
            s.stripeSubscriptionId === sub.stripeSubscriptionId
              ? { ...s, cancelAtPeriodEnd: true }
              : s,
          ),
        );
      }
    } catch {}
    setCancelingId(null);
  }

  async function handleReactivate(sub: MemberSub) {
    setReactivatingId(sub.stripeSubscriptionId);
    try {
      const res = await fetch("/api/stripe/member-subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: sub.stripeSubscriptionId }),
      });
      if (res.ok) {
        setSubscriptions((prev) =>
          prev.map((s) =>
            s.stripeSubscriptionId === sub.stripeSubscriptionId
              ? { ...s, cancelAtPeriodEnd: false }
              : s,
          ),
        );
      }
    } catch {}
    setReactivatingId(null);
  }

  const now = Date.now();
  const active = packages.filter((p) => {
    const notExpired = new Date(p.expiresAt).getTime() > now;
    const hasCredits = p.creditsTotal === null || (p.creditsTotal - p.creditsUsed) > 0;
    return notExpired && hasCredits;
  });
  const expired = packages.filter((p) => {
    const isExpired = new Date(p.expiresAt).getTime() <= now;
    const noCredits = p.creditsTotal !== null && (p.creditsTotal - p.creditsUsed) <= 0;
    return isExpired || noCredits;
  });
  const activeSubs = subscriptions.filter((s) => s.status !== "canceled");
  const canceledSubs = subscriptions.filter((s) => s.status === "canceled");
  const hasContent = packages.length > 0 || subscriptions.length > 0;

  function renderPackageCard(pkg: UserPackageWithDetails, isExpired: boolean) {
    const remaining = pkg.creditsTotal !== null
      ? pkg.creditsTotal - pkg.creditsUsed
      : null;
    const progress = pkg.creditsTotal !== null
      ? ((pkg.creditsTotal - pkg.creditsUsed) / pkg.creditsTotal) * 100
      : 100;
    const days = daysUntil(pkg.expiresAt);
    const noCreditsLeft = pkg.creditsTotal !== null && remaining !== null && remaining <= 0;
    const dateExpired = new Date(pkg.expiresAt).getTime() <= now;

    return (
      <motion.div key={pkg.id} variants={fadeUp}>
        <Card className={isExpired ? "opacity-50" : ""}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <Badge variant={isExpired ? "secondary" : "success"}>
                  {noCreditsLeft && !dateExpired ? "Sin créditos" : isExpired ? "Expirado" : "Activo"}
                </Badge>
                <CardTitle className="mt-2">{pkg.package.name}</CardTitle>
                {pkg.package.description && (
                  <CardDescription className="mt-1">
                    {pkg.package.description}
                  </CardDescription>
                )}
                {(pkg.package as any).classTypes?.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted">
                    Válido para: {(pkg.package as any).classTypes.map((ct: { name: string }) => ct.name).join(", ")}
                  </p>
                )}
              </div>
              <Package className="h-5 w-5 text-muted/30" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                {pkg.creditsTotal === null ? (
                  <div className="flex items-center gap-2">
                    <InfinityIcon className="h-6 w-6 text-accent" />
                    <p className="font-mono text-2xl font-bold text-accent">
                      Ilimitado
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="font-mono text-3xl font-bold text-foreground">
                      {remaining}
                      <span className="text-lg text-muted">
                        /{pkg.creditsTotal}
                      </span>
                    </p>
                    <p className="text-xs text-muted">créditos restantes</p>
                  </>
                )}
              </div>
              {!isExpired && (
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-foreground">
                    {days}
                  </p>
                  <p className="text-[10px] text-muted">
                    {days === 1 ? "día restante" : "días restantes"}
                  </p>
                </div>
              )}
            </div>

            {pkg.creditsTotal !== null && (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${isExpired ? 0 : progress}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="flex-1 font-display text-xl font-bold text-foreground">
            Mis Paquetes
          </h1>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link href="/packages">
              Ver planes
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : !hasContent ? (
          <Card className="border border-dashed border-accent/30 bg-accent/5">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Package className="h-12 w-12 text-accent/40" />
              <p className="mt-4 font-display text-xl font-bold text-foreground">
                Sin paquetes
              </p>
              <p className="mt-2 text-sm text-muted">
                Adquiere un paquete para comenzar a reservar tus clases
              </p>
              <Button asChild className="mt-6">
                <Link href="/packages">Ver paquetes disponibles</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            className="space-y-4"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            {/* Active subscriptions */}
            {activeSubs.map((sub) => {
              const badge = STATUS_LABEL[sub.status] ?? { text: sub.status, variant: "secondary" as const };
              const periodEnd = new Date(sub.currentPeriodEnd).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "long",
              });
              const interval = sub.package.recurringInterval === "year" ? "año" : "mes";

              return (
                <motion.div key={sub.id} variants={fadeUp}>
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant={badge.variant}>{badge.text}</Badge>
                            {sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
                              <Badge variant="warning">Cancela {periodEnd}</Badge>
                            )}
                          </div>
                          <CardTitle className="mt-2">{sub.package.name}</CardTitle>
                          <p className="mt-1 text-sm text-muted">
                            {formatCurrency(sub.package.price, sub.package.currency)}/{interval}
                          </p>
                        </div>
                        <CalendarSync className="h-5 w-5 text-muted/30" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {sub.status === "paused" && sub.resumesAt && (
                        <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                          <Pause className="h-4 w-4" />
                          Pausada — reanuda el{" "}
                          {new Date(sub.resumesAt).toLocaleDateString("es-ES", {
                            day: "numeric",
                            month: "long",
                          })}
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted">
                          {sub.cancelAtPeriodEnd
                            ? `Acceso hasta: ${periodEnd}`
                            : `Próxima renovación: ${periodEnd}`}
                        </p>
                        {sub.cancelAtPeriodEnd && sub.status !== "canceled" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reactivatingId === sub.stripeSubscriptionId}
                            onClick={() => handleReactivate(sub)}
                          >
                            {reactivatingId === sub.stripeSubscriptionId ? (
                              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1.5 h-3 w-3" />
                            )}
                            Reactivar
                          </Button>
                        ) : !sub.cancelAtPeriodEnd && sub.status !== "canceled" && sub.status !== "paused" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={cancelingId === sub.stripeSubscriptionId}
                            onClick={() => handleCancel(sub)}
                          >
                            {cancelingId === sub.stripeSubscriptionId ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <XCircle className="mr-1 h-3 w-3" />
                            )}
                            Cancelar
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}

            {/* Active packages */}
            {active.map((p) => renderPackageCard(p, false))}

            {(expired.length > 0 || canceledSubs.length > 0) && (
              <>
                <Separator className="my-6" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Expirados
                </p>

                {canceledSubs.map((sub) => {
                  const interval = sub.package.recurringInterval === "year" ? "año" : "mes";
                  return (
                    <motion.div key={sub.id} variants={fadeUp}>
                      <Card className="opacity-50 hover:opacity-80 transition-opacity">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <Badge variant="danger">Cancelada</Badge>
                              <CardTitle className="mt-2">{sub.package.name}</CardTitle>
                              <p className="mt-1 text-sm text-muted">
                                {formatCurrency(sub.package.price, sub.package.currency)}/{interval}
                              </p>
                            </div>
                            <CalendarSync className="h-5 w-5 text-muted/30" />
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted">
                              Finalizó el{" "}
                              {new Date(sub.currentPeriodEnd).toLocaleDateString("es-ES", {
                                day: "numeric",
                                month: "long",
                              })}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRenewSub(sub)}
                            >
                              <RefreshCw className="mr-1.5 h-3 w-3" />
                              Renovar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}

                {expired.map((p) => renderPackageCard(p, true))}
              </>
            )}
          </motion.div>
        )}
      </div>
      <AnimatePresence>
        {renewSub && (
          <SubscribeSheet
            open={!!renewSub}
            onClose={() => setRenewSub(null)}
            pkg={renewSub.package}
            onSuccess={() => {
              setRenewSub(null);
              setLoading(true);
              Promise.all([
                fetch("/api/packages/mine").then((r) => (r.ok ? r.json() : [])),
                fetch("/api/stripe/member-subscription").then((r) => (r.ok ? r.json() : [])),
              ])
                .then(([pkgs, subs]) => {
                  setPackages(pkgs);
                  setSubscriptions(subs);
                })
                .catch(() => {})
                .finally(() => setLoading(false));
            }}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
