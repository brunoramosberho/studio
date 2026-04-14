"use client";

import { motion } from "framer-motion";
import { cn, formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { UserPackageWithDetails } from "@/types";

interface PackageSelectorProps {
  packages: UserPackageWithDetails[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  classTypeId?: string;
}

export function PackageSelector({
  packages,
  selectedId,
  onSelect,
  classTypeId,
}: PackageSelectorProps) {
  const sorted = [...packages].sort(
    (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
  );
  const recommendedId = sorted[0]?.id;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        Selecciona tu paquete
      </p>

      {sorted.map((pkg, i) => {
        const isSelected = selectedId === pkg.id;
        const isRecommended = pkg.id === recommendedId;
        const hasAllocations = (pkg.creditUsages?.length ?? 0) > 0;
        const allocUsage = hasAllocations && classTypeId
          ? pkg.creditUsages!.find((u) => u.classTypeId === classTypeId)
          : null;

        const creditsRemaining = hasAllocations
          ? allocUsage
            ? allocUsage.creditsTotal - allocUsage.creditsUsed
            : 0
          : pkg.creditsTotal !== null
            ? (pkg.creditsTotal ?? 0) - pkg.creditsUsed
            : null;

        const creditsTotal = hasAllocations
          ? allocUsage?.creditsTotal ?? 0
          : pkg.creditsTotal;

        return (
          <motion.button
            key={pkg.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onSelect(pkg.id)}
            className="w-full touch-manipulation"
          >
            <Card
              className={cn(
                "rounded-2xl transition-all duration-200 cursor-pointer",
                isSelected
                  ? "ring-2 ring-[#C9A96E] shadow-md"
                  : "hover:shadow-md",
              )}
            >
              <CardContent className="flex items-center gap-4 p-4">
                {/* Radio indicator */}
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    isSelected
                      ? "border-[#C9A96E] bg-[#C9A96E]"
                      : "border-muted/30",
                  )}
                >
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                      className="h-2 w-2 rounded-full bg-card"
                    />
                  )}
                </div>

                {/* Package info */}
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-sm font-bold text-foreground">
                      {pkg.package.name}
                    </span>
                    {isRecommended && (
                      <Badge variant="default" className="shrink-0 text-[10px]">
                        Recomendado
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Vence {formatDate(pkg.expiresAt)}
                  </p>
                </div>

                {/* Credits */}
                <div className="shrink-0 text-right">
                  {creditsRemaining !== null ? (
                    <p className="font-mono text-sm font-medium text-foreground">
                      <span className="text-[#C9A96E]">{creditsRemaining}</span>
                      <span className="text-muted/50">/{creditsTotal}</span>
                    </p>
                  ) : (
                    <Badge variant="success" className="text-[10px]">
                      Ilimitado
                    </Badge>
                  )}
                  <p className="text-[10px] text-muted">
                    {hasAllocations && allocUsage ? allocUsage.classType.name : "créditos"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.button>
        );
      })}
    </div>
  );
}
