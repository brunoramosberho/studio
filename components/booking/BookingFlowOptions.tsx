"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Star, ArrowRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useFormatMoney } from "@/components/tenant-provider";
import type { BookingFlowData, MembershipOption } from "@/lib/conversion/nudge-engine";

interface BookingFlowOptionsProps {
  data: BookingFlowData;
  classPrice: number;
  onSelect: (option: "single" | string) => void;
  onContinue: () => void;
}

export function BookingFlowOptions({
  data,
  classPrice,
  onSelect,
  onContinue,
}: BookingFlowOptionsProps) {
  const formatCurrency = useFormatMoney();
  const [selected, setSelected] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  function trackEvent(event: string, extra?: Record<string, unknown>) {
    fetch("/api/conversion/nudge/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nudgeType: "booking_flow", event, ...extra }),
    }).catch(() => {});
  }

  async function handleActivate() {
    if (!selected || selected === "single") {
      trackEvent("dismissed");
      onSelect("single");
      return;
    }

    trackEvent("interacted", { membershipId: selected });
    setActivating(true);
    try {
      const res = await fetch("/api/conversion/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: selected,
          nudgeType: "booking_flow",
        }),
      });
      if (res.ok) {
        trackEvent("converted", { membershipId: selected });
        onSelect(selected);
      }
    } finally {
      setActivating(false);
    }
  }

  const featured = data.memberships.find(
    (m) => m.id === data.featuredMembershipId,
  );
  const rest = data.memberships.filter(
    (m) => m.id !== data.featuredMembershipId,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* Savings banner */}
      {data.savingsIfMember !== null ? (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 flex-shrink-0" />
            <span>
              Con membresía, tus {data.classesBoughtThisMonth} clases este mes te habrían salido a{" "}
              <strong>
                {formatCurrency(
                  data.membershipPrice / Math.max(1, data.classesBoughtThisMonth),
                )}
                /clase
              </strong>
              . Habrías ahorrado{" "}
              <strong>{formatCurrency(data.savingsIfMember)}</strong>.
            </span>
          </div>
        </div>
      ) : data.classesToBreakEven > 0 ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 flex-shrink-0" />
            <span>
              Si vienes{" "}
              <strong>
                {data.classesToBreakEven} vez
                {data.classesToBreakEven !== 1 ? "es" : ""} más
              </strong>{" "}
              este mes, el mensual empieza a salirte a cuenta.
            </span>
          </div>
        </div>
      ) : null}

      {/* Single class option */}
      <OptionCard
        selected={selected === "single"}
        onSelect={() => setSelected("single")}
        label="Clase suelta"
        price={classPrice > 0 ? formatCurrency(classPrice) : undefined}
      />

      {/* Featured membership */}
      {featured && (
        <OptionCard
          selected={selected === featured.id}
          onSelect={() => setSelected(featured.id)}
          label={featured.name}
          price={formatCurrency(featured.price, featured.currency)}
          period={`/${featured.validDays >= 28 ? "mes" : `${featured.validDays}d`}`}
          badge="Recomendada"
          description={featured.description ?? undefined}
        />
      )}

      {/* Rest of memberships */}
      {rest.map((m) => (
        <OptionCard
          key={m.id}
          selected={selected === m.id}
          onSelect={() => setSelected(m.id)}
          label={m.name}
          price={formatCurrency(m.price, m.currency)}
          period={`/${m.validDays >= 28 ? "mes" : `${m.validDays}d`}`}
          description={m.description ?? undefined}
        />
      ))}

      <Button
        size="lg"
        className="w-full min-h-[48px]"
        onClick={handleActivate}
        disabled={!selected || activating}
      >
        {activating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {selected && selected !== "single" ? (
          <>
            Empezar membresía
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        ) : (
          "Continuar con clase suelta"
        )}
      </Button>
    </motion.div>
  );
}

function OptionCard({
  selected,
  onSelect,
  label,
  price,
  period,
  badge,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  price?: string;
  period?: string;
  badge?: string;
  description?: string;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer rounded-2xl border-2 transition-all",
        selected
          ? "border-[#3730B8] bg-[#3730B8]/[0.02]"
          : "border-stone-200 hover:border-stone-300",
      )}
      onClick={onSelect}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
            selected
              ? "border-[#3730B8] bg-[#3730B8]"
              : "border-stone-300",
          )}
        >
          {selected && (
            <div className="h-2 w-2 rounded-full bg-card" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">
              {label}
            </span>
            {badge && (
              <span className="rounded-full bg-[#3730B8] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs text-muted line-clamp-1">
              {description}
            </p>
          )}
        </div>
        {price && (
          <div className="text-right flex-shrink-0">
            <span className="text-sm font-semibold text-foreground">
              {price}
            </span>
            {period && (
              <span className="text-xs text-muted">{period}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
