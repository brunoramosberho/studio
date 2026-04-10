"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarSync,
  Clock,
  Loader2,
  Pause,
  RefreshCw,
  Share2,
  Ticket,
  Users,
  XCircle,
  Check,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/shared/page-transition";
import { useBranding } from "@/components/branding-provider";
import { formatCurrency } from "@/lib/utils";

interface ClassTypeRef {
  id: string;
  name: string;
}

interface MemberSub {
  id: string;
  stripeSubscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  pausedAt: string | null;
  resumesAt: string | null;
  createdAt: string;
  package: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    recurringInterval: string | null;
    credits: number | null;
    validDays: number;
    classTypes: ClassTypeRef[];
  };
}

interface CreditUsageRef {
  id: string;
  classTypeId: string;
  creditsTotal: number;
  creditsUsed: number;
  classType: ClassTypeRef;
}

interface UserPkg {
  id: string;
  creditsTotal: number | null;
  creditsUsed: number;
  expiresAt: string;
  purchasedAt: string;
  creditUsages?: CreditUsageRef[];
  package: {
    id: string;
    name: string;
    description: string | null;
    type: string;
    price: number;
    currency: string;
    credits: number | null;
    validDays: number;
    classTypes: ClassTypeRef[];
  };
}

const STATUS_BADGE: Record<string, { text: string; variant: "success" | "warning" | "secondary" | "danger" }> = {
  active: { text: "Activo", variant: "success" },
  past_due: { text: "Pago pendiente", variant: "warning" },
  paused: { text: "Pausada", variant: "secondary" },
  canceled: { text: "Cancelada", variant: "danger" },
  trialing: { text: "Prueba", variant: "success" },
};

function formatDateLong(date: string) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(date: string) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function MembershipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { studioName, logoUrl, appIconUrl } = useBranding();

  const [subscription, setSubscription] = useState<MemberSub | null>(null);
  const [userPkg, setUserPkg] = useState<UserPkg | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [relatedPkg, setRelatedPkg] = useState<UserPkg | null>(null);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      fetch("/api/stripe/member-subscription").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/packages/mine").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([subs, pkgs]: [MemberSub[], UserPkg[]]) => {
        const sub = subs.find((s) => s.id === id);
        if (sub) {
          setSubscription(sub);
          const related = pkgs
            .filter((p: UserPkg) => p.package.id === sub.package.id)
            .sort((a: UserPkg, b: UserPkg) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())[0];
          if (related) setRelatedPkg(related);
          return;
        }
        const pkg = pkgs.find((p: UserPkg) => p.id === id);
        if (pkg) setUserPkg(pkg);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function handleCancel() {
    if (!subscription) return;
    if (!confirm("¿Cancelar suscripción? Seguirás teniendo acceso hasta el fin del periodo actual.")) return;
    setCanceling(true);
    try {
      const res = await fetch("/api/stripe/member-subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: subscription.stripeSubscriptionId }),
      });
      if (res.ok) {
        setSubscription((prev) => prev ? { ...prev, cancelAtPeriodEnd: true } : prev);
      }
    } catch {}
    setCanceling(false);
  }

  async function handleReactivate() {
    if (!subscription) return;
    setReactivating(true);
    try {
      const res = await fetch("/api/stripe/member-subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: subscription.stripeSubscriptionId }),
      });
      if (res.ok) {
        setSubscription((prev) => prev ? { ...prev, cancelAtPeriodEnd: false } : prev);
      }
    } catch {}
    setReactivating(false);
  }

  function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: subscription?.package.name ?? userPkg?.package.name, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-32 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (subscription) {
    return <SubscriptionDetail
      sub={subscription}
      relatedPkg={relatedPkg}
      studioName={studioName}
      studioIcon={appIconUrl || logoUrl}
      userName={session?.user?.name ?? ""}
      onCancel={handleCancel}
      onReactivate={handleReactivate}
      canceling={canceling}
      reactivating={reactivating}
      onBack={() => router.back()}
      onShare={handleShare}
      copied={copied}
    />;
  }

  if (userPkg) {
    return <PackageDetail
      pkg={userPkg}
      studioName={studioName}
      studioIcon={appIconUrl || logoUrl}
      onBack={() => router.back()}
    />;
  }

  return (
    <div className="py-20 text-center">
      <CalendarSync className="mx-auto mb-3 h-10 w-10 text-muted" />
      <h1 className="font-display text-xl font-bold text-foreground">
        No encontrado
      </h1>
      <p className="mt-1 text-sm text-muted">
        Esta membresía no existe o no tienes acceso.
      </p>
      <Button
        variant="outline"
        className="mt-6"
        onClick={() => router.push("/my/packages")}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Mis paquetes
      </Button>
    </div>
  );
}

function SubscriptionDetail({
  sub,
  relatedPkg,
  studioName,
  studioIcon,
  userName,
  onCancel,
  onReactivate,
  canceling,
  reactivating,
  onBack,
  onShare,
  copied,
}: {
  sub: MemberSub;
  relatedPkg: UserPkg | null;
  studioName: string;
  studioIcon: string | null;
  userName: string;
  onCancel: () => void;
  onReactivate: () => void;
  canceling: boolean;
  reactivating: boolean;
  onBack: () => void;
  onShare: () => void;
  copied: boolean;
}) {
  const badge = STATUS_BADGE[sub.status] ?? { text: sub.status, variant: "secondary" as const };
  const interval = sub.package.recurringInterval === "year" ? "año" : "mes";
  const isActive = sub.status === "active" || sub.status === "trialing";
  const periodEnd = formatDateLong(sub.currentPeriodEnd);
  const periodEndShort = formatDateShort(sub.currentPeriodEnd);

  return (
    <PageTransition>
      <div className="space-y-0">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <button
            onClick={onShare}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Share2 className="h-4 w-4 text-muted" />
            )}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-4 space-y-6"
        >
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Suscripción
              </span>
              <span className="text-muted">·</span>
              <Badge variant={badge.variant}>{badge.text}</Badge>
              {sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
                <Badge variant="warning">Cancela {periodEndShort}</Badge>
              )}
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
              {sub.package.name}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {formatCurrency(sub.package.price, sub.package.currency)} {interval === "mes" ? "monthly" : "yearly"}
            </p>
          </div>

          {/* Renewal info */}
          <div className="flex items-center gap-2.5 text-sm text-muted">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span>
              {sub.cancelAtPeriodEnd
                ? `Acceso hasta: ${periodEnd}`
                : `Próxima renovación: ${periodEnd}`}
            </span>
          </div>

          {/* Paused banner */}
          {sub.status === "paused" && sub.resumesAt && (
            <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <Pause className="h-4 w-4" />
              Pausada — reanuda el{" "}
              {formatDateShort(sub.resumesAt)}
            </div>
          )}

          {/* Credits */}
          {relatedPkg?.creditUsages && relatedPkg.creditUsages.length > 0 ? (
            <div className="rounded-2xl border border-border/50 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Ticket className="h-5 w-5 text-muted" />
                Créditos por disciplina
              </div>
              {relatedPkg.creditUsages.map((u) => {
                const remaining = u.creditsTotal - u.creditsUsed;
                const pct = u.creditsTotal > 0 ? (u.creditsUsed / u.creditsTotal) * 100 : 0;
                return (
                  <div key={u.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{u.classType.name}</span>
                      <span className="font-mono text-muted">
                        <span className="text-foreground">{remaining}</span>/{u.creditsTotal}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 rounded-xl bg-surface/80 px-3 py-2 text-xs text-muted">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Los límites se renuevan el {periodEndShort}.</span>
              </div>
            </div>
          ) : sub.package.credits ? (
            <div className="rounded-2xl border border-border/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Ticket className="h-5 w-5 text-muted" />
                  <div>
                    <p className="font-mono text-lg font-bold text-foreground">
                      <span className="tabular-nums">
                        {relatedPkg ? relatedPkg.creditsUsed : 0}
                      </span>
                      <span className="text-muted">
                        /{relatedPkg?.creditsTotal ?? sub.package.credits}
                      </span>
                    </p>
                  </div>
                </div>
                <span className="text-sm text-muted">clases utilizadas</span>
              </div>

              {relatedPkg && relatedPkg.creditsTotal && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${(relatedPkg.creditsUsed / relatedPkg.creditsTotal) * 100}%` }}
                  />
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface/80 px-3 py-2 text-xs text-muted">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Los límites se renuevan el {periodEndShort}.
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/50 p-4">
              <div className="flex items-center gap-3">
                <Ticket className="h-5 w-5 text-accent" />
                <span className="font-medium text-foreground">Clases ilimitadas</span>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface/80 px-3 py-2 text-xs text-muted">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  El periodo se renueva el {periodEndShort}.
                </span>
              </div>
            </div>
          )}

          {/* Studio branding */}
          <div className="flex items-center gap-3 rounded-2xl border border-border/50 px-4 py-3">
            {studioIcon ? (
              <img
                src={studioIcon}
                alt={studioName}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
                <CalendarSync className="h-4 w-4 text-accent" />
              </div>
            )}
            <span className="flex-1 text-sm font-medium text-foreground">
              {studioName}
            </span>
          </div>

          {/* Description */}
          {sub.package.description && (
            <div>
              <h2 className="font-display text-base font-bold text-foreground">
                Descripción
              </h2>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {sub.package.description}
              </div>
            </div>
          )}

          {/* Class types */}
          {sub.package.classTypes && sub.package.classTypes.length > 0 && (
            <div>
              <h2 className="font-display text-base font-bold text-foreground">
                Válido para
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {sub.package.classTypes.map((ct) => (
                  <Badge key={ct.id} variant="secondary">{ct.name}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Subscription holder */}
          <div>
            <h2 className="font-display text-base font-bold text-foreground">
              Suscripción titular
            </h2>
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border/50 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-sm font-bold text-muted">
                {userName?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <span className="text-sm font-medium text-foreground">
                {userName || "Usuario"}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3 pb-8">
            {sub.cancelAtPeriodEnd && sub.status !== "canceled" ? (
              <Button
                variant="outline"
                className="w-full rounded-full"
                disabled={reactivating}
                onClick={onReactivate}
              >
                {reactivating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Reactivar suscripción
              </Button>
            ) : isActive && !sub.cancelAtPeriodEnd ? (
              <button
                onClick={onCancel}
                disabled={canceling}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm font-medium text-muted transition-colors hover:bg-surface active:bg-surface disabled:opacity-50"
              >
                {canceling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Cancelar renovación
              </button>
            ) : null}
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}

function PackageDetail({
  pkg,
  studioName,
  studioIcon,
  onBack,
}: {
  pkg: UserPkg;
  studioName: string;
  studioIcon: string | null;
  onBack: () => void;
}) {
  const remaining = pkg.creditsTotal !== null ? pkg.creditsTotal - pkg.creditsUsed : null;
  const progress = pkg.creditsTotal !== null ? ((pkg.creditsTotal - pkg.creditsUsed) / pkg.creditsTotal) * 100 : 100;
  const now = Date.now();
  const isExpired = new Date(pkg.expiresAt).getTime() <= now;
  const noCredits = pkg.creditsTotal !== null && remaining !== null && remaining <= 0;
  const daysLeft = Math.max(0, Math.ceil((new Date(pkg.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24)));

  return (
    <PageTransition>
      <div className="space-y-0">
        {/* Top bar */}
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-4 space-y-6"
        >
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {pkg.package.type === "OFFER" ? "Oferta" : "Paquete"}
              </span>
              <span className="text-muted">·</span>
              <Badge variant={isExpired || noCredits ? "secondary" : "success"}>
                {noCredits && !isExpired ? "Sin créditos" : isExpired ? "Expirado" : "Activo"}
              </Badge>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground">
              {pkg.package.name}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Comprado el {formatDateShort(pkg.purchasedAt)}
            </p>
          </div>

          {/* Credits */}
          <div className="rounded-2xl border border-border/50 p-4">
            {pkg.creditUsages && pkg.creditUsages.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Ticket className="h-5 w-5 text-muted" />
                  Créditos por disciplina
                </div>
                {pkg.creditUsages.map((u) => {
                  const rem = u.creditsTotal - u.creditsUsed;
                  const pct = u.creditsTotal > 0 ? ((u.creditsTotal - u.creditsUsed) / u.creditsTotal) * 100 : 0;
                  return (
                    <div key={u.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{u.classType.name}</span>
                        <span className="font-mono text-muted">
                          <span className="text-foreground">{rem}</span>/{u.creditsTotal}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${isExpired ? 0 : pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : pkg.creditsTotal === null ? (
              <div className="flex items-center gap-3">
                <Ticket className="h-5 w-5 text-accent" />
                <span className="font-medium text-foreground">Clases ilimitadas</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Ticket className="h-5 w-5 text-muted" />
                    <div>
                      <p className="font-mono text-lg font-bold text-foreground">
                        <span className="tabular-nums">{remaining}</span>
                        <span className="text-muted">/{pkg.creditsTotal}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-sm text-muted">créditos restantes</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${isExpired || noCredits ? 0 : progress}%` }}
                  />
                </div>
              </>
            )}

            {!isExpired && !noCredits && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface/80 px-3 py-2 text-xs text-muted">
                <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {daysLeft} {daysLeft === 1 ? "día" : "días"} restantes · Expira el {formatDateShort(pkg.expiresAt)}
                </span>
              </div>
            )}

            {(isExpired || noCredits) && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {noCredits && !isExpired ? "Sin créditos disponibles" : `Expiró el ${formatDateShort(pkg.expiresAt)}`}
                </span>
              </div>
            )}
          </div>

          {/* Studio branding */}
          <div className="flex items-center gap-3 rounded-2xl border border-border/50 px-4 py-3">
            {studioIcon ? (
              <img
                src={studioIcon}
                alt={studioName}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
                <Ticket className="h-4 w-4 text-accent" />
              </div>
            )}
            <span className="flex-1 text-sm font-medium text-foreground">
              {studioName}
            </span>
          </div>

          {/* Description */}
          {pkg.package.description && (
            <div>
              <h2 className="font-display text-base font-bold text-foreground">
                Descripción
              </h2>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {pkg.package.description}
              </div>
            </div>
          )}

          {/* Class types */}
          {pkg.package.classTypes && pkg.package.classTypes.length > 0 && (
            <div className="pb-8">
              <h2 className="font-display text-base font-bold text-foreground">
                Válido para
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {pkg.package.classTypes.map((ct) => (
                  <Badge key={ct.id} variant="secondary">{ct.name}</Badge>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </PageTransition>
  );
}
