"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Gift,
  Layers,
  CalendarSync,
  Ticket,
  Share,
  Check,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/shared/page-transition";
import { PurchaseSheet } from "@/components/booking/purchase-sheet";
import { formatCurrency, cn } from "@/lib/utils";

interface ClassTypeRef {
  id: string;
  name: string;
}

interface PackageData {
  id: string;
  name: string;
  description: string | null;
  type: "OFFER" | "PACK" | "SUBSCRIPTION";
  credits: number | null;
  validDays: number;
  price: number;
  currency: string;
  isPromo: boolean;
  isActive: boolean;
  classTypes: ClassTypeRef[];
  recurringInterval: string | null;
  sortOrder: number;
}

function buildFeatures(pkg: PackageData): string[] {
  const features: string[] = [];

  if (pkg.credits) {
    const perClass = formatCurrency(
      Math.round(pkg.price / pkg.credits),
      pkg.currency
    );
    features.push(
      `${pkg.credits} ${pkg.credits === 1 ? "clase" : "clases"} (${perClass} c/u)`
    );
  } else {
    features.push("Clases ilimitadas");
  }

  features.push(`Válido por ${pkg.validDays} días`);

  if (pkg.classTypes.length > 0) {
    features.push(pkg.classTypes.map((c) => c.name).join(", "));
  } else {
    features.push("Cualquier disciplina");
  }

  if (pkg.type === "SUBSCRIPTION") {
    features.push(
      pkg.recurringInterval === "year"
        ? "Renovación anual"
        : "Renovación mensual"
    );
  }

  return features;
}

const TYPE_ICON = {
  OFFER: Gift,
  PACK: Layers,
  SUBSCRIPTION: CalendarSync,
};

const TYPE_LABEL = {
  OFFER: "Oferta",
  PACK: "Paquete",
  SUBSCRIPTION: "Suscripción",
};

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const isLoggedIn = authStatus === "authenticated";

  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: pkg, isLoading } = useQuery<PackageData | null>({
    queryKey: ["package-detail", id],
    queryFn: async () => {
      const res = await fetch("/api/packages");
      if (!res.ok) return null;
      const all: PackageData[] = await res.json();
      return all.find((p) => p.id === id) || null;
    },
    enabled: !!id,
  });

  const { data: myPackages = [] } = useQuery<
    { id: string; creditsTotal: number | null; creditsUsed: number; expiresAt: string }[]
  >({
    queryKey: ["packages", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/packages/mine");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isLoggedIn,
  });

  const activeCredits = myPackages
    .filter((p) => new Date(p.expiresAt).getTime() > Date.now())
    .reduce((sum, p) => {
      if (p.creditsTotal === null) return Infinity;
      return sum + Math.max(0, (p.creditsTotal ?? 0) - p.creditsUsed);
    }, 0);

  function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: pkg?.name, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (isLoading || authStatus === "loading") {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <Skeleton className="mb-4 h-8 w-32" />
        <Skeleton className="mb-8 h-6 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Layers className="mx-auto mb-3 h-10 w-10 text-muted" />
        <h1 className="font-display text-xl font-bold text-foreground">
          Paquete no encontrado
        </h1>
        <p className="mt-1 text-sm text-muted">
          Puede que haya sido desactivado o el link sea incorrecto.
        </p>
        <Link
          href="/packages"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Ver todos los paquetes
        </Link>
      </div>
    );
  }

  const features = buildFeatures(pkg);
  const Icon = TYPE_ICON[pkg.type];

  return (
    <PageTransition>
      <div className="mx-auto max-w-lg px-4 py-8 sm:py-16">
        {/* Back */}
        <Link
          href="/packages"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Todos los paquetes
        </Link>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={cn(
            "relative overflow-hidden rounded-2xl border bg-white p-8",
            pkg.isPromo && "border-2 border-dashed border-accent/40"
          )}
        >
          {pkg.isPromo && (
            <div className="absolute -top-0 right-4 rounded-b-lg bg-accent/10 px-3 py-1">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-accent">
                <Gift className="h-3 w-3" />
                Primera vez
              </span>
            </div>
          )}

          {/* Type badge */}
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              <Icon className="h-4 w-4 text-accent" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              {TYPE_LABEL[pkg.type]}
            </span>
          </div>

          {/* Name & description */}
          {pkg.description && (
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-accent">
              {pkg.description}
            </p>
          )}
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            {pkg.name}
          </h1>

          {/* Price */}
          <div className="mt-4 mb-6">
            <span className="font-mono text-4xl font-medium text-foreground">
              {formatCurrency(pkg.price, pkg.currency)}
            </span>
            {pkg.credits && (
              <span className="ml-2 text-base text-muted">
                / {pkg.credits} {pkg.credits === 1 ? "clase" : "clases"}
              </span>
            )}
            {pkg.type === "SUBSCRIPTION" && (
              <span className="ml-2 text-base text-muted">
                / {pkg.recurringInterval === "year" ? "año" : "mes"}
              </span>
            )}
          </div>

          {/* Features */}
          <ul className="space-y-3 border-t border-border/40 pt-6">
            {features.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2.5 text-sm text-muted"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                {feature}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="mt-8 space-y-3">
            <Button
              className="w-full rounded-full text-base py-6"
              onClick={() => setSheetOpen(true)}
            >
              {pkg.isPromo
                ? "Probar ahora"
                : pkg.type === "SUBSCRIPTION"
                  ? "Suscribirme"
                  : `Comprar por ${formatCurrency(pkg.price, pkg.currency)}`}
            </Button>

            <button
              onClick={handleShare}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm font-medium text-muted transition-colors hover:bg-surface"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-500" />
                  Link copiado
                </>
              ) : (
                <>
                  <Share className="h-4 w-4" />
                  Compartir
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Active credits */}
        {isLoggedIn && activeCredits > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3"
          >
            <Ticket className="h-4 w-4 text-accent" />
            <span className="text-sm text-foreground">
              Ya tienes{" "}
              <span className="font-bold text-accent">
                {activeCredits === Infinity
                  ? "créditos ilimitados"
                  : `${activeCredits} crédito${activeCredits !== 1 ? "s" : ""}`}
              </span>
            </span>
          </motion.div>
        )}

        {/* Help */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 rounded-2xl bg-surface/80 p-6 text-center"
        >
          <Sparkles className="mx-auto mb-2 h-6 w-6 text-accent" />
          <p className="text-sm text-muted">
            ¿Tienes dudas? Escríbenos y te ayudamos a elegir.
          </p>
        </motion.div>
      </div>

      <AnimatePresence>
        {sheetOpen && pkg && (
          <PurchaseSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            pkg={pkg as any}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
