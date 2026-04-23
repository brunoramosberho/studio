"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ArrowRight, Package, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useFormatMoney } from "@/components/tenant-provider";
import type { PackageUpgradeData, MembershipOption } from "@/lib/conversion/nudge-engine";

interface PackageUpgradeCardProps {
  data: PackageUpgradeData;
  onContinue: () => void;
}

export function PackageUpgradeCard({
  data,
  onContinue,
}: PackageUpgradeCardProps) {
  const formatCurrency = useFormatMoney();
  const [selectedMembership, setSelectedMembership] =
    useState<MembershipOption | null>(data.memberships[0] ?? null);
  const [activating, setActivating] = useState(false);

  const finalPrice = selectedMembership
    ? Math.max(0, selectedMembership.price - data.creditAmount)
    : 0;

  async function handleUpgrade() {
    if (!selectedMembership) return;
    setActivating(true);
    try {
      const res = await fetch("/api/conversion/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: selectedMembership.id,
          nudgeType: "package_upgrade",
          packageCreditAmount: data.creditAmount,
        }),
      });
      if (res.ok) {
        await fetch("/api/conversion/nudge/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nudgeType: "package_upgrade",
            event: "converted",
            membershipId: selectedMembership.id,
            revenue: finalPrice,
          }),
        });
        onContinue();
      }
    } finally {
      setActivating(false);
    }
  }

  const progressPct =
    data.classesRemaining > 0
      ? Math.max(
          5,
          ((data.classesRemaining /
            (data.classesRemaining + 5)) *
            100),
        )
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <Card className="rounded-2xl">
        <CardContent className="p-5 space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted">Tu paquete</span>
              <span className="font-medium text-foreground">
                {data.classesRemaining} clase
                {data.classesRemaining !== 1 ? "s" : ""} restante
                {data.classesRemaining !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-stone-100">
              <div
                className="h-2 rounded-full bg-amber-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Upgrade box */}
          {data.creditAmount > 0 && (
            <div className="rounded-xl bg-[#EEEDFE] px-4 py-3 text-sm text-[#3C3489]">
              <p className="font-medium">
                Tus {data.classesRemaining} clase
                {data.classesRemaining !== 1 ? "s" : ""} ={" "}
                {formatCurrency(data.creditAmount)} de crédito
              </p>
              {selectedMembership && (
                <p className="mt-1">
                  Pagas solo{" "}
                  <strong>{formatCurrency(finalPrice, selectedMembership.currency)}</strong>{" "}
                  el primer mes
                </p>
              )}
            </div>
          )}

          {/* Membership selection */}
          {data.memberships.length > 1 && (
            <div className="space-y-2">
              {data.memberships.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMembership(m)}
                  className={cn(
                    "w-full rounded-xl border-2 px-4 py-3 text-left text-sm transition-all",
                    selectedMembership?.id === m.id
                      ? "border-[#3730B8] bg-[#3730B8]/[0.02]"
                      : "border-stone-200 hover:border-stone-300",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{m.name}</span>
                    <span className="font-semibold">
                      {formatCurrency(m.price, m.currency)}
                      <span className="text-xs text-muted font-normal">
                        /{m.validDays >= 28 ? "mes" : `${m.validDays}d`}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Upgrade CTA */}
          <Button
            size="lg"
            className="w-full min-h-[48px] bg-[#3730B8] hover:bg-[#2D27A0]"
            onClick={handleUpgrade}
            disabled={activating || !selectedMembership}
          >
            {activating && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Hacer upgrade por {formatCurrency(finalPrice)}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {/* Alternative: renew package */}
          <Button
            asChild
            variant="secondary"
            size="lg"
            className="w-full min-h-[48px]"
          >
            <Link href="/packages">
              <RefreshCw className="mr-2 h-4 w-4" />
              Renovar paquete
            </Link>
          </Button>

          {/* Skip */}
          <button
            onClick={onContinue}
            className="w-full text-center text-sm text-muted hover:text-foreground transition-colors"
          >
            Continuar sin cambios
          </button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
