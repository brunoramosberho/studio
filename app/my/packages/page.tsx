"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Package, Infinity as InfinityIcon, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PageTransition } from "@/components/shared/page-transition";
import type { UserPackageWithDetails } from "@/types";

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

export default function PackagesPage() {
  const [packages, setPackages] = useState<UserPackageWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPackages() {
      try {
        const res = await fetch("/api/packages/mine");
        if (res.ok) setPackages(await res.json());
      } catch {
        /* silently fail */
      } finally {
        setLoading(false);
      }
    }
    fetchPackages();
  }, []);

  const now = Date.now();
  const active = packages.filter((p) => new Date(p.expiresAt).getTime() > now);
  const expired = packages.filter((p) => new Date(p.expiresAt).getTime() <= now);

  function renderPackageCard(pkg: UserPackageWithDetails, isExpired: boolean) {
    const remaining = pkg.creditsTotal !== null
      ? pkg.creditsTotal - pkg.creditsUsed
      : null;
    const progress = pkg.creditsTotal !== null
      ? ((pkg.creditsTotal - pkg.creditsUsed) / pkg.creditsTotal) * 100
      : 100;
    const days = daysUntil(pkg.expiresAt);

    return (
      <motion.div key={pkg.id} variants={fadeUp}>
        <Card className={isExpired ? "opacity-50" : ""}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <Badge variant={isExpired ? "secondary" : "success"}>
                  {isExpired ? "Expirado" : "Activo"}
                </Badge>
                <CardTitle className="mt-2">{pkg.package.name}</CardTitle>
                {pkg.package.description && (
                  <CardDescription className="mt-1">
                    {pkg.package.description}
                  </CardDescription>
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Mis Paquetes
          </h1>
          <Button asChild size="sm">
            <Link href="/packages">
              Comprar paquete
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : packages.length === 0 ? (
          <Card className="border border-dashed border-accent/30 bg-accent/5">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Package className="h-12 w-12 text-accent/40" />
              <p className="mt-4 font-display text-xl font-bold text-foreground">
                Sin paquetes
              </p>
              <p className="mt-2 text-sm text-muted">
                Adquiere un paquete para comenzar a reservar tus clases de Pilates
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
            {active.map((p) => renderPackageCard(p, false))}

            {expired.length > 0 && (
              <>
                <Separator className="my-6" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Paquetes expirados
                </p>
                {expired.map((p) => renderPackageCard(p, true))}
              </>
            )}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
