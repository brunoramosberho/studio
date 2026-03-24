"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  CheckCircle2,
  Sparkles,
  Gift,
  Ticket,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/shared/page-transition";
import { PurchaseSheet } from "@/components/booking/purchase-sheet";
import { formatCurrency } from "@/lib/utils";
import type { Package } from "@prisma/client";

interface UserPackageSummary {
  id: string;
  creditsTotal: number | null;
  creditsUsed: number;
  expiresAt: string;
  package: { name: string };
}

function buildFeatures(pkg: Package) {
  const features: string[] = [];

  if (pkg.credits) {
    const perClass = formatCurrency(Math.round(pkg.price / pkg.credits), pkg.currency);
    features.push(`${pkg.credits} ${pkg.credits === 1 ? "clase" : "clases"} (${perClass} c/u)`);
  } else {
    features.push("Clases ilimitadas");
  }

  features.push(`Válido por ${pkg.validDays} días`);
  features.push("Cualquier modalidad");

  if (pkg.credits && pkg.credits >= 10) features.push("Reserva prioritaria");

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

  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: packages = [], isLoading: loadingPackages } = useQuery<Package[]>({
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

  const visiblePackages = packages.filter((pkg) => {
    if (pkg.isPromo && isReturningUser) return false;
    return true;
  });

  const maxCredits = Math.max(
    ...visiblePackages.filter((p) => p.credits).map((p) => p.credits!),
    0,
  );
  const popularPkg = visiblePackages.find(
    (p) => p.credits && p.credits >= 10 && p.credits < maxCredits,
  );

  function handleBuy(pkg: Package) {
    setSelectedPkg(pkg);
    setSheetOpen(true);
  }

  const loading = loadingPackages || authStatus === "loading";

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 sm:mb-12 sm:text-center">
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Paquetes
          </h1>
          <p className="mt-2 text-sm text-muted sm:mx-auto sm:max-w-lg sm:mt-3 sm:text-base">
            Elige el plan que se adapte a tu ritmo. Todas las modalidades incluidas.
          </p>
        </div>

        {/* Active credits summary (logged in) */}
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
                {activeCredits === Infinity ? "créditos ilimitados" : `${activeCredits} crédito${activeCredits !== 1 ? "s" : ""}`}
              </span>{" "}
              disponibles
            </span>
          </motion.div>
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
          >
            {visiblePackages.map((pkg) => {
              const isPopular = popularPkg?.id === pkg.id;
              const features = buildFeatures(pkg);

              return (
                <motion.div key={pkg.id} variants={fadeUp}>
                  <Card
                    className={`relative flex flex-col h-full transition-all duration-300 hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-0.5 ${
                      isPopular
                        ? "border-2 border-accent shadow-[var(--shadow-warm-lift)]"
                        : ""
                    } ${pkg.isPromo ? "border-2 border-dashed border-accent/40" : ""}`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-accent text-white shadow-[var(--shadow-warm)]">
                          <Star className="mr-1 h-3 w-3" /> Más popular
                        </Badge>
                      </div>
                    )}
                    {pkg.isPromo && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-accent/10 text-accent shadow-[var(--shadow-warm)]">
                          <Gift className="mr-1 h-3 w-3" /> Primera vez
                        </Badge>
                      </div>
                    )}

                    <CardHeader className="pb-2">
                      {pkg.description && (
                        <CardDescription className="text-xs font-medium uppercase tracking-wider text-accent">
                          {pkg.description}
                        </CardDescription>
                      )}
                      <CardTitle className="text-xl">{pkg.name}</CardTitle>
                    </CardHeader>

                    <CardContent className="flex flex-1 flex-col">
                      <div className="mb-4">
                        <span className="font-mono text-3xl font-medium text-foreground">
                          {formatCurrency(pkg.price, pkg.currency)}
                        </span>
                        {pkg.credits && (
                          <span className="ml-1 text-sm text-muted">
                            / {pkg.credits} {pkg.credits === 1 ? "clase" : "clases"}
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
                          variant={isPopular ? "default" : "secondary"}
                          onClick={() => handleBuy(pkg)}
                        >
                          {pkg.isPromo ? "Probar ahora" : "Comprar"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
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
            pkg={selectedPkg}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
