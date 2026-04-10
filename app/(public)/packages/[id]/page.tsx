"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  CreditCard,
  Gift,
  Layers,
  CalendarSync,
  Ticket,
  Share2,
  Check,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/shared/page-transition";
import { PurchaseSheet } from "@/components/booking/purchase-sheet";
import { SubscribeSheet } from "@/components/checkout/SubscribeSheet";
import { useBranding } from "@/components/branding-provider";
import { formatCurrency } from "@/lib/utils";

interface ClassTypeRef {
  id: string;
  name: string;
}

interface CreditAlloc {
  classTypeId: string;
  credits: number;
  classType: ClassTypeRef;
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
  creditAllocations?: CreditAlloc[];
  recurringInterval: string | null;
  sortOrder: number;
}

const TYPE_META: Record<
  PackageData["type"],
  { label: string; icon: typeof Gift }
> = {
  OFFER: { label: "Oferta", icon: Gift },
  PACK: { label: "Paquete de clases", icon: Layers },
  SUBSCRIPTION: { label: "Suscripción", icon: CalendarSync },
};

function validDaysLabel(days: number): string {
  if (days <= 7) return `${days} días`;
  if (days <= 31) return `${Math.round(days / 7)} semana${Math.round(days / 7) > 1 ? "s" : ""}`;
  if (days <= 365) {
    const months = Math.round(days / 30);
    return `${months} ${months === 1 ? "mes" : "meses"}`;
  }
  const years = Math.round(days / 365);
  return `${years} año${years > 1 ? "s" : ""}`;
}

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const { studioName, logoUrl, appIconUrl } = useBranding();
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
      <div className="mx-auto max-w-lg px-4 py-8">
        <Skeleton className="mb-6 h-5 w-20" />
        <Skeleton className="mb-2 h-4 w-32" />
        <Skeleton className="mb-6 h-10 w-64" />
        <Skeleton className="mb-3 h-5 w-48" />
        <Skeleton className="mb-3 h-5 w-36" />
        <Skeleton className="mb-8 h-16 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
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

  const meta = TYPE_META[pkg.type];
  const Icon = meta.icon;
  const studioIcon = appIconUrl || logoUrl;

  return (
    <PageTransition>
      <div className="mx-auto max-w-lg">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-background/80 px-4 py-3 backdrop-blur-lg sm:relative sm:bg-transparent sm:px-0 sm:py-8 sm:backdrop-blur-none">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <button
            onClick={handleShare}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Share2 className="h-4 w-4 text-muted" />
            )}
          </button>
        </div>

        <div className="px-4 sm:px-0">
          {/* Type label */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {meta.label}
            </p>

            {/* Name */}
            <h1 className="mt-1.5 font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl">
              {pkg.name}
            </h1>
          </motion.div>

          {/* Info pills */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="mt-4 space-y-2.5"
          >
            <div className="flex items-center gap-2.5 text-sm text-muted">
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span>
                {pkg.type === "SUBSCRIPTION"
                  ? `Renovación ${pkg.recurringInterval === "year" ? "anual" : "mensual"}`
                  : `Caduca despues de ${validDaysLabel(pkg.validDays)}`}
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-muted">
              <CreditCard className="h-4 w-4 flex-shrink-0" />
              <span>
                {formatCurrency(pkg.price, pkg.currency)}
                {pkg.type === "SUBSCRIPTION" && (
                  <span> / {pkg.recurringInterval === "year" ? "año" : "mes"}</span>
                )}
              </span>
            </div>
            {pkg.creditAllocations && pkg.creditAllocations.length > 0 ? (
              pkg.creditAllocations.map((alloc) => (
                <div key={alloc.classTypeId} className="flex items-center gap-2.5 text-sm text-muted">
                  <Ticket className="h-4 w-4 flex-shrink-0" />
                  <span>
                    {alloc.credits} {alloc.credits === 1 ? "crédito" : "créditos"} de {alloc.classType.name}
                  </span>
                </div>
              ))
            ) : pkg.credits ? (
              <div className="flex items-center gap-2.5 text-sm text-muted">
                <Ticket className="h-4 w-4 flex-shrink-0" />
                <span>
                  {pkg.credits} {pkg.credits === 1 ? "crédito de clase" : "créditos de clase"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-sm text-muted">
                <Ticket className="h-4 w-4 flex-shrink-0" />
                <span>Clases ilimitadas</span>
              </div>
            )}
          </motion.div>

          {/* Studio branding row */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mt-6 flex items-center gap-3 rounded-2xl border border-border/50 px-4 py-3"
          >
            {studioIcon ? (
              <img
                src={studioIcon}
                alt={studioName}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
                <Icon className="h-4 w-4 text-accent" />
              </div>
            )}
            <span className="text-sm font-medium text-foreground">
              {studioName}
            </span>
          </motion.div>

          {/* Description */}
          {pkg.description && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="mt-8"
            >
              <h2 className="font-display text-base font-bold text-foreground">
                Descripción
              </h2>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {pkg.description}
              </div>
            </motion.div>
          )}

          {/* Class types */}
          {pkg.classTypes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="mt-6"
            >
              <h2 className="font-display text-base font-bold text-foreground">
                Válido para
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {pkg.classTypes.map((ct) => (
                  <Badge key={ct.id} variant="secondary">
                    {ct.name}
                  </Badge>
                ))}
              </div>
            </motion.div>
          )}

          {pkg.classTypes.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="mt-6 text-sm text-muted"
            >
              Válido para cualquier disciplina
            </motion.div>
          )}

          {/* Promo badge */}
          {pkg.isPromo && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="mt-6 text-xs font-medium text-muted"
            >
              *Máximo 1 uso por persona*
            </motion.div>
          )}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="mt-8 px-4 sm:px-0"
        >
          <Button
            size="lg"
            className="w-full rounded-full py-6 text-base"
            onClick={() => setSheetOpen(true)}
          >
            {pkg.type === "SUBSCRIPTION"
              ? `Suscribirme por ${formatCurrency(pkg.price, pkg.currency)}/${pkg.recurringInterval === "year" ? "año" : "mes"}`
              : pkg.isPromo
                ? "Probar ahora"
                : `Comprar por ${formatCurrency(pkg.price, pkg.currency)}`}
          </Button>
        </motion.div>
      </div>

      {/* Purchase / Subscribe Sheet */}
      <AnimatePresence>
        {sheetOpen && pkg && pkg.type === "SUBSCRIPTION" ? (
          <SubscribeSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            pkg={pkg}
          />
        ) : sheetOpen && pkg ? (
          <PurchaseSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            pkg={pkg as any}
          />
        ) : null}
      </AnimatePresence>
    </PageTransition>
  );
}
