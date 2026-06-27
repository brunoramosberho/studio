"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2, Gift, Package, RefreshCw, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, cn } from "@/lib/utils";

interface ClassTypeRef {
  id: string;
  name: string;
}
interface CreditAlloc {
  credits: number;
  classType: { id: string; name: string };
}
interface PackageData {
  id: string;
  name: string;
  description: string | null;
  type: "OFFER" | "PACK" | "SUBSCRIPTION" | "ON_DEMAND_SUBSCRIPTION";
  credits: number | null;
  validDays: number;
  price: number;
  currency: string;
  isActive: boolean;
  isPromo: boolean;
  classTypes: ClassTypeRef[];
  creditAllocations?: CreditAlloc[];
  recurringInterval: string | null;
  includesOnDemand?: boolean;
  sortOrder: number;
  maxPurchasesPerCustomer?: number | null;
}

const GROUPS: {
  key: string;
  title: string;
  icon: typeof Package;
  match: (t: PackageData["type"]) => boolean;
}[] = [
  { key: "OFFER", title: "Ofertas", icon: Gift, match: (t) => t === "OFFER" },
  { key: "PACK", title: "Paquetes", icon: Package, match: (t) => t === "PACK" },
  {
    key: "SUB",
    title: "Suscripciones",
    icon: RefreshCw,
    match: (t) => t === "SUBSCRIPTION" || t === "ON_DEMAND_SUBSCRIPTION",
  },
];

export default function AdminCatalogPage() {
  const t = useTranslations("public");

  const { data: packages = [], isLoading } = useQuery<PackageData[]>({
    queryKey: ["admin-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/packages?all=true");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  function validDaysShort(days: number): string {
    if (days <= 7) return `${days} ${t("daysUnit")}`;
    if (days <= 31) return `${Math.round(days / 7)} ${t("weeksUnit")}`;
    if (days <= 365) {
      const m = Math.round(days / 30);
      return `${m} ${m === 1 ? t("monthUnit") : t("monthsUnit")}`;
    }
    const y = Math.round(days / 365);
    return `${y} ${y > 1 ? t("yearsUnit") : t("yearUnit")}`;
  }

  function buildFeatures(pkg: PackageData): string[] {
    const features: string[] = [];
    if (pkg.type === "ON_DEMAND_SUBSCRIPTION") {
      features.push(t("onDemandUnlimited"));
      features.push(pkg.recurringInterval === "year" ? t("annualRenewal") : t("monthlyRenewal"));
      return features;
    }
    if (pkg.creditAllocations && pkg.creditAllocations.length > 0) {
      pkg.creditAllocations.forEach((a) => features.push(`${a.credits} ${a.classType.name}`));
    } else if (pkg.credits) {
      features.push(`${pkg.credits} ${pkg.credits === 1 ? t("classUnit") : t("classesUnit")}`);
    } else {
      features.push(t("unlimitedClasses"));
    }
    if (pkg.type === "SUBSCRIPTION") {
      features.push(pkg.recurringInterval === "year" ? t("annualRenewal") : t("monthlyRenewal"));
    } else {
      features.push(`${t("validFor")} ${validDaysShort(pkg.validDays)}`);
    }
    features.push(
      pkg.classTypes.length > 0 ? pkg.classTypes.map((c) => c.name).join(", ") : t("anyDiscipline"),
    );
    if (pkg.type === "SUBSCRIPTION" && pkg.includesOnDemand) features.push(t("plusOnDemandIncluded"));
    return features;
  }

  const active = packages
    .filter((p) => p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Paquetes y precios</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Referencia de solo lectura — para mostrar a los clientes cuando preguntan por costos.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center text-muted">
          No hay paquetes activos todavía.
        </div>
      ) : (
        GROUPS.map((group) => {
          const items = active.filter((p) => group.match(p.type));
          if (items.length === 0) return null;
          const GroupIcon = group.icon;
          return (
            <section key={group.key} className="space-y-3">
              <div className="flex items-center gap-2">
                <GroupIcon className="h-4 w-4 text-muted/70" />
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted/60">
                  {group.title}
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((pkg) => (
                  <div
                    key={pkg.id}
                    className={cn(
                      "flex flex-col rounded-2xl border bg-card p-5",
                      pkg.isPromo ? "border-accent/40" : "border-border/60",
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
                      {pkg.type === "OFFER"
                        ? "Oferta"
                        : pkg.type === "SUBSCRIPTION" || pkg.type === "ON_DEMAND_SUBSCRIPTION"
                          ? "Suscripción"
                          : "Paquete"}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold text-foreground">{pkg.name}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="font-display text-2xl font-bold text-foreground">
                        {formatCurrency(pkg.price, pkg.currency)}
                      </span>
                      {(pkg.type === "SUBSCRIPTION" || pkg.type === "ON_DEMAND_SUBSCRIPTION") && (
                        <span className="text-sm text-muted">
                          /{pkg.recurringInterval === "year" ? "año" : "mes"}
                        </span>
                      )}
                    </div>

                    <ul className="mt-3 flex-1 space-y-1.5">
                      {buildFeatures(pkg).map((f) => (
                        <li key={f} className="flex items-start gap-2 text-[13px] text-muted">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    {pkg.description && (
                      <p className="mt-3 border-t border-border/40 pt-3 text-[12px] leading-relaxed text-muted/80">
                        {pkg.description}
                      </p>
                    )}
                    {pkg.maxPurchasesPerCustomer != null && (
                      <p className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        Máx. {pkg.maxPurchasesPerCustomer} por cliente
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
