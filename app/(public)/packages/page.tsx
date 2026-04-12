"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  Gift,
  Ticket,
  Layers,
  CalendarSync,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/shared/page-transition";
import { PurchaseSheet } from "@/components/booking/purchase-sheet";
import { SubscribeSheet } from "@/components/checkout/SubscribeSheet";
import { formatCurrency, cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

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

interface UserPackageSummary {
  id: string;
  creditsTotal: number | null;
  creditsUsed: number;
  expiresAt: string;
  package: { name: string };
}

type TabType = "OFFER" | "PACK" | "SUBSCRIPTION";

const TABS: { type: TabType; label: string; icon: typeof Gift }[] = [
  { type: "OFFER", label: "Ofertas", icon: Gift },
  { type: "PACK", label: "Paquetes", icon: Layers },
  { type: "SUBSCRIPTION", label: "Suscripciones", icon: CalendarSync },
];

function validDaysShort(days: number): string {
  if (days <= 7) return `${days} días`;
  if (days <= 31) {
    const w = Math.round(days / 7);
    return `${w} sem`;
  }
  if (days <= 365) {
    const m = Math.round(days / 30);
    return `${m} ${m === 1 ? "mes" : "meses"}`;
  }
  const y = Math.round(days / 365);
  return `${y} año${y > 1 ? "s" : ""}`;
}

function buildFeatures(pkg: PackageData): string[] {
  const features: string[] = [];

  if (pkg.creditAllocations && pkg.creditAllocations.length > 0) {
    pkg.creditAllocations.forEach((a) => {
      features.push(`${a.credits} ${a.classType.name}`);
    });
  } else if (pkg.credits) {
    features.push(`${pkg.credits} ${pkg.credits === 1 ? "clase" : "clases"}`);
  } else {
    features.push("Clases ilimitadas");
  }

  if (pkg.type === "SUBSCRIPTION") {
    features.push(pkg.recurringInterval === "year" ? "Renovación anual" : "Renovación mensual");
  } else {
    features.push(`Válido por ${validDaysShort(pkg.validDays)}`);
  }

  if (pkg.classTypes.length > 0) {
    features.push(pkg.classTypes.map((c) => c.name).join(", "));
  } else {
    features.push("Cualquier disciplina");
  }

  return features;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export default function PackagesPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const isLoggedIn = authStatus === "authenticated";

  const [selectedPkg, setSelectedPkg] = useState<PackageData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: packages = [], isLoading: loadingPackages } = useQuery<PackageData[]>({
    queryKey: ["packages-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/packages");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: myPackages = [] } = useQuery<UserPackageSummary[]>({
    queryKey: ["packages", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/packages/mine");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isLoggedIn,
  });

  const isReturningUser = myPackages.length > 0;
  const now = Date.now();
  const activeCredits = myPackages
    .filter((p) => new Date(p.expiresAt).getTime() > now)
    .reduce((sum, p) => {
      if (p.creditsTotal === null) return Infinity;
      return sum + Math.max(0, (p.creditsTotal ?? 0) - p.creditsUsed);
    }, 0);

  const visiblePackages = useMemo(
    () => packages.filter((pkg) => !(pkg.isPromo && isReturningUser)),
    [packages, isReturningUser],
  );

  const availableTabs = useMemo(() => {
    return TABS.filter((tab) => visiblePackages.some((p) => p.type === tab.type));
  }, [visiblePackages]);

  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const currentTab = activeTab ?? availableTabs[0]?.type ?? "PACK";

  const filtered = useMemo(
    () => visiblePackages.filter((p) => p.type === currentTab),
    [visiblePackages, currentTab],
  );

  function handleBuy(e: React.MouseEvent, pkg: PackageData) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPkg(pkg);
    setSheetOpen(true);
  }

  const loading = loadingPackages || authStatus === "loading";

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-16 lg:px-8">
        {/* Header */}
        <div className="mb-6 sm:mb-12">
          <div className="flex items-center gap-3 sm:justify-center">
            <button
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface sm:hidden"
            >
              <ChevronLeft className="h-5 w-5 text-foreground" />
            </button>
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-4xl">
              Precios
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted sm:mx-auto sm:max-w-lg sm:mt-3 sm:text-center sm:text-base">
            Ofertas, paquetes y suscripciones para tu ritmo.
          </p>
        </div>

        {/* Credits summary */}
        {isLoggedIn && activeCredits > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center gap-2 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 sm:mx-auto sm:max-w-sm sm:justify-center"
          >
            <Ticket className="h-4 w-4 text-accent" />
            <span className="text-sm text-foreground">
              Tienes{" "}
              <span className="font-bold text-accent">
                {activeCredits === Infinity
                  ? "créditos ilimitados"
                  : `${activeCredits} crédito${activeCredits !== 1 ? "s" : ""}`}
              </span>{" "}
              disponibles
            </span>
          </motion.div>
        )}

        {/* Tabs */}
        {!loading && availableTabs.length > 1 && (
          <div className="mb-8 flex justify-center">
            <div className="flex gap-1 rounded-xl bg-surface p-1">
              {availableTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.type}
                    onClick={() => setActiveTab(tab.type)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all",
                      currentTab === tab.type
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 opacity-80" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        )}

        {/* Packages grid */}
        {!loading && (
          <motion.div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            variants={stagger}
            initial="hidden"
            animate="show"
            key={currentTab}
          >
            {filtered.map((pkg) => {
              const features = buildFeatures(pkg);

              return (
                <motion.div key={pkg.id} variants={fadeUp}>
                  <Link
                    href={`/packages/${pkg.id}`}
                    className={cn(
                      "relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white p-4 sm:p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-warm-md active:scale-[0.98]",
                      pkg.isPromo && "border-2 border-dashed border-accent/40",
                    )}
                  >
                    {pkg.isPromo && (
                      <div className="absolute -top-0 right-3 rounded-b-lg bg-accent/10 px-2.5 py-0.5 sm:right-4 sm:px-3 sm:py-1">
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-accent sm:text-[11px]">
                          <Gift className="h-3 w-3" />
                          Primera vez
                        </span>
                      </div>
                    )}

                    <div className="mb-3 sm:mb-4">
                      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted sm:mb-1 sm:text-[11px]">
                        {pkg.type === "OFFER"
                          ? "Oferta"
                          : pkg.type === "SUBSCRIPTION"
                            ? "Suscripción"
                            : "Paquete"}
                      </p>
                      <h3 className="font-display text-lg font-bold text-foreground sm:text-xl">
                        {pkg.name}
                      </h3>
                    </div>

                    <div className="mb-3 sm:mb-5">
                      <span className="font-mono text-2xl font-medium text-foreground sm:text-3xl">
                        {formatCurrency(pkg.price, pkg.currency)}
                      </span>
                      {pkg.creditAllocations && pkg.creditAllocations.length > 0 ? (
                        <span className="ml-1 text-xs text-muted sm:text-sm">
                          / {pkg.creditAllocations.map((a) => `${a.credits} ${a.classType.name}`).join(" + ")}
                        </span>
                      ) : pkg.credits ? (
                        <span className="ml-1 text-xs text-muted sm:text-sm">
                          / {pkg.credits} {pkg.credits === 1 ? "clase" : "clases"}
                        </span>
                      ) : null}
                      {pkg.type === "SUBSCRIPTION" && (
                        <span className="ml-1 text-xs text-muted sm:text-sm">
                          / {pkg.recurringInterval === "year" ? "año" : "mes"}
                        </span>
                      )}
                    </div>

                    <ul className="flex-1 space-y-1.5 sm:space-y-2.5">
                      {features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-1.5 text-[13px] text-muted sm:gap-2 sm:text-sm"
                        >
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent sm:h-4 sm:w-4" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex items-center gap-2 sm:mt-6">
                      <Button
                        className="flex-1 rounded-full"
                        onClick={(e) => handleBuy(e, pkg)}
                      >
                        {pkg.isPromo
                          ? "Probar ahora"
                          : pkg.type === "SUBSCRIPTION"
                            ? "Suscribirme"
                            : `Comprar por ${formatCurrency(pkg.price, pkg.currency)}`}
                      </Button>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-muted transition-colors sm:hidden">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}

      </div>

      {/* Purchase / Subscribe Sheet */}
      <AnimatePresence>
        {sheetOpen && selectedPkg && selectedPkg.type === "SUBSCRIPTION" ? (
          <SubscribeSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            pkg={selectedPkg}
          />
        ) : sheetOpen && selectedPkg ? (
          <PurchaseSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            pkg={selectedPkg as any}
          />
        ) : null}
      </AnimatePresence>
    </PageTransition>
  );
}
