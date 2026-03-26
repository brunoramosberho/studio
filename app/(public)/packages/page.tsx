"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Sparkles,
  Gift,
  Ticket,
  Layers,
  CalendarSync,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function buildFeatures(pkg: PackageData): string[] {
  const features: string[] = [];

  if (pkg.credits) {
    const perClass = formatCurrency(Math.round(pkg.price / pkg.credits), pkg.currency);
    features.push(`${pkg.credits} ${pkg.credits === 1 ? "clase" : "clases"} (${perClass} c/u)`);
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
    features.push(pkg.recurringInterval === "year" ? "Renovación anual" : "Renovación mensual");
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

  function handleBuy(pkg: PackageData) {
    setSelectedPkg(pkg);
    setSheetOpen(true);
  }

  const loading = loadingPackages || authStatus === "loading";

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-16 lg:px-8">
        {/* Header */}
        <div className="mb-8 sm:mb-12 sm:text-center">
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Precios
          </h1>
          <p className="mt-2 text-sm text-muted sm:mx-auto sm:max-w-lg sm:mt-3 sm:text-base">
            Ofertas de entrada, paquetes de clases y suscripciones para tu ritmo.
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
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            variants={stagger}
            initial="hidden"
            animate="show"
            key={currentTab}
          >
            {filtered.map((pkg) => {
              const features = buildFeatures(pkg);

              return (
                <motion.div key={pkg.id} variants={fadeUp}>
                  <div
                    className={cn(
                      "relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-warm-md",
                      pkg.isPromo && "border-2 border-dashed border-accent/40",
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

                    <div className="mb-4">
                      {pkg.description && (
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-accent">
                          {pkg.description}
                        </p>
                      )}
                      <h3 className="font-display text-xl font-bold text-foreground">
                        {pkg.name}
                      </h3>
                    </div>

                    <div className="mb-5">
                      <span className="font-mono text-3xl font-medium text-foreground">
                        {formatCurrency(pkg.price, pkg.currency)}
                      </span>
                      {pkg.credits && (
                        <span className="ml-1 text-sm text-muted">
                          / {pkg.credits} {pkg.credits === 1 ? "clase" : "clases"}
                        </span>
                      )}
                      {pkg.type === "SUBSCRIPTION" && (
                        <span className="ml-1 text-sm text-muted">
                          / {pkg.recurringInterval === "year" ? "año" : "mes"}
                        </span>
                      )}
                    </div>

                    <ul className="flex-1 space-y-2.5">
                      {features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-sm text-muted"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6">
                      <Button
                        className="w-full rounded-full"
                        onClick={() => handleBuy(pkg)}
                      >
                        {pkg.isPromo
                          ? "Probar ahora"
                          : pkg.type === "SUBSCRIPTION"
                            ? "Suscribirme"
                            : `Comprar por ${formatCurrency(pkg.price, pkg.currency)}`}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Help section */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mx-auto mt-12 max-w-2xl rounded-2xl bg-surface/80 p-6 text-center sm:p-8"
          >
            <Sparkles className="mx-auto mb-3 h-7 w-7 text-accent" />
            <h3 className="font-display text-lg font-bold text-foreground">
              ¿No sabes cuál elegir?
            </h3>
            <p className="mt-1 text-sm text-muted">
              Escríbenos y te ayudamos a encontrar el paquete perfecto para tus
              objetivos.
            </p>
          </motion.div>
        )}
      </div>

      {/* Purchase Sheet */}
      <AnimatePresence>
        {sheetOpen && selectedPkg && (
          <PurchaseSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            pkg={selectedPkg as any}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
