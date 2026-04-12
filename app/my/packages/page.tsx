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
  ChevronRight,
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
import { useTranslations } from "next-intl";
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
    description: string | null;
    price: number;
    currency: string;
    recurringInterval: string | null;
    credits: number | null;
    validDays: number;
    classTypes: { id: string; name: string }[];
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

// STATUS_LABEL is defined inside the component to access translations

export default function PackagesPage() {
  const t = useTranslations("member");
  const STATUS_LABEL: Record<string, { text: string; variant: "success" | "warning" | "secondary" | "danger" }> = {
    active: { text: t("subActive"), variant: "success" },
    past_due: { text: t("subPastDue"), variant: "warning" },
    paused: { text: t("subPaused"), variant: "secondary" },
    canceled: { text: t("subCanceled"), variant: "danger" },
    trialing: { text: t("subTrialing"), variant: "success" },
  };
  const router = useRouter();
  const [packages, setPackages] = useState<UserPackageWithDetails[]>([]);
  const [subscriptions, setSubscriptions] = useState<MemberSub[]>([]);
  const [loading, setLoading] = useState(true);
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

  const now = Date.now();
  const active = packages.filter((p) => {
    const notExpired = new Date(p.expiresAt).getTime() > now;
    const hasAllocations = (p.creditUsages?.length ?? 0) > 0;
    const hasCredits = hasAllocations
      ? p.creditUsages!.some((u) => u.creditsUsed < u.creditsTotal)
      : p.creditsTotal === null || (p.creditsTotal - p.creditsUsed) > 0;
    return notExpired && hasCredits;
  });
  const expired = packages.filter((p) => {
    const isExpired = new Date(p.expiresAt).getTime() <= now;
    const hasAllocations = (p.creditUsages?.length ?? 0) > 0;
    const noCredits = hasAllocations
      ? p.creditUsages!.every((u) => u.creditsUsed >= u.creditsTotal)
      : p.creditsTotal !== null && (p.creditsTotal - p.creditsUsed) <= 0;
    return isExpired || noCredits;
  });
  const activeSubs = subscriptions.filter((s) => s.status !== "canceled");
  const canceledSubs = subscriptions.filter((s) => s.status === "canceled");
  const hasContent = packages.length > 0 || subscriptions.length > 0;

  function renderSubscriptionCard(sub: MemberSub, isCanceled: boolean) {
    const badge = STATUS_LABEL[sub.status] ?? { text: sub.status, variant: "secondary" as const };
    const periodEnd = new Date(sub.currentPeriodEnd).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const interval = sub.package.recurringInterval === "year" ? t("year") : t("month");

    return (
      <motion.div key={sub.id} variants={fadeUp}>
        <Link href={`/my/membership/${sub.id}`}>
          <Card className={`transition-all active:scale-[0.98] ${isCanceled ? "opacity-50 hover:opacity-80" : "hover:shadow-warm-sm"}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={isCanceled ? "danger" : badge.variant}>
                      {isCanceled ? t("subCanceled") : badge.text}
                    </Badge>
                    {sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
                      <Badge variant="warning">{t("cancelsOn")} {new Date(sub.currentPeriodEnd).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</Badge>
                    )}
                  </div>
                  <CardTitle className="mt-2 truncate">{sub.package.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted">
                    {formatCurrency(sub.package.price, sub.package.currency)}/{interval}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-muted/40" />
              </div>
            </CardHeader>
            <CardContent>
              {sub.status === "paused" && sub.resumesAt && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <Pause className="h-4 w-4" />
                  {t("pausedResumesOn")}{" "}
                  {new Date(sub.resumesAt).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
                </div>
              )}
              <p className="text-xs text-muted">
                {isCanceled
                  ? `${t("endedOn")} ${periodEnd}`
                  : sub.cancelAtPeriodEnd
                    ? `${t("accessUntil")}: ${periodEnd}`
                    : `${t("renewsOn")} ${periodEnd}`}
              </p>
            </CardContent>
          </Card>
        </Link>
      </motion.div>
    );
  }

  function renderPackageCard(pkg: UserPackageWithDetails, isExpired: boolean) {
    const hasAllocations = (pkg.creditUsages?.length ?? 0) > 0;
    const remaining = pkg.creditsTotal !== null
      ? pkg.creditsTotal - pkg.creditsUsed
      : null;
    const progress = pkg.creditsTotal !== null
      ? ((pkg.creditsTotal - pkg.creditsUsed) / pkg.creditsTotal) * 100
      : 100;
    const days = daysUntil(pkg.expiresAt);
    const noCreditsLeft = hasAllocations
      ? pkg.creditUsages!.every((u) => u.creditsUsed >= u.creditsTotal)
      : pkg.creditsTotal !== null && remaining !== null && remaining <= 0;
    const dateExpired = new Date(pkg.expiresAt).getTime() <= now;

    return (
      <motion.div key={pkg.id} variants={fadeUp}>
        <Link href={`/my/membership/${pkg.id}`}>
          <Card className={`transition-all active:scale-[0.98] ${isExpired ? "opacity-50 hover:opacity-80" : "hover:shadow-warm-sm"}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <Badge variant={isExpired ? "secondary" : "success"}>
                    {noCreditsLeft && !dateExpired ? t("noCredits") : isExpired ? t("expired") : t("activeLabel")}
                  </Badge>
                  <CardTitle className="mt-2 truncate">{pkg.package.name}</CardTitle>
                  {pkg.package.description && (
                    <CardDescription className="mt-1 line-clamp-1">
                      {pkg.package.description}
                    </CardDescription>
                  )}
                  {(pkg.package.classTypes?.length ?? 0) > 0 && (
                    <p className="mt-1.5 text-xs text-muted">
                      {t("validFor")}: {pkg.package.classTypes!.map((ct) => ct.name).join(", ")}
                    </p>
                  )}
                </div>
                <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-muted/40" />
              </div>
            </CardHeader>
            <CardContent>
              {hasAllocations ? (
                <div className="space-y-3">
                  {pkg.creditUsages!.map((u) => {
                    const rem = u.creditsTotal - u.creditsUsed;
                    const pct = u.creditsTotal > 0 ? ((u.creditsTotal - u.creditsUsed) / u.creditsTotal) * 100 : 0;
                    return (
                      <div key={u.id}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-foreground">{u.classType.name}</span>
                          <span className="font-mono text-xs text-muted">
                            <span className="text-foreground">{rem}</span>/{u.creditsTotal}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                          <div
                            className="h-full rounded-full bg-accent transition-all"
                            style={{ width: `${isExpired ? 0 : pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {!isExpired && (
                    <p className="text-[10px] text-muted">
                      {days} {t("daysRemaining", { count: days })}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-end justify-between">
                    <div>
                      {pkg.creditsTotal === null ? (
                        <div className="flex items-center gap-2">
                          <InfinityIcon className="h-6 w-6 text-accent" />
                          <p className="font-mono text-2xl font-bold text-accent">
                            {t("unlimited")}
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
                          <p className="text-xs text-muted">{t("creditsRemaining")}</p>
                        </>
                      )}
                    </div>
                    {!isExpired && (
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-foreground">
                          {days}
                        </p>
                        <p className="text-[10px] text-muted">
                          {t("daysRemaining", { count: days })}
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
                </>
              )}
            </CardContent>
          </Card>
        </Link>
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
            {t("myPackages")}
          </h1>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link href="/packages">
              {t("viewPlans")}
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
                {t("noPackages")}
              </p>
              <p className="mt-2 text-sm text-muted">
                {t("noPackagesDesc")}
              </p>
              <Button asChild className="mt-6">
                <Link href="/packages">{t("viewAvailablePackages")}</Link>
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
            {activeSubs.map((sub) => renderSubscriptionCard(sub, false))}

            {/* Active packages */}
            {active.map((p) => renderPackageCard(p, false))}

            {(expired.length > 0 || canceledSubs.length > 0) && (
              <>
                <Separator className="my-6" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  {t("expired")}
                </p>

                {canceledSubs.map((sub) => renderSubscriptionCard(sub, true))}
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
