"use client";

import { Wallet } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useTranslations } from "next-intl";
import { useFormatMoney } from "@/components/tenant-provider";

export interface RevenueMixSlice {
  type: string;
  amount: number;
}

const TYPE_LABEL_KEYS: Record<string, string> = {
  PACK: "typePack",
  SUBSCRIPTION: "typeSubscription",
  ON_DEMAND_SUBSCRIPTION: "typeOnDemand",
  OFFER: "typeOffer",
};

const TYPE_COLORS: Record<string, string> = {
  PACK: "#3f55c2",
  SUBSCRIPTION: "#10b981",
  ON_DEMAND_SUBSCRIPTION: "#8b5cf6",
  OFFER: "#f59e0b",
};

const FALLBACK_COLORS = ["#64748b", "#0ea5e9", "#ef4444", "#ec4899"];

interface PieEntry {
  name: string;
  value: number;
  color: string;
}

export function RevenueMixDonut({
  mix,
  activeSubsCount,
}: {
  mix: RevenueMixSlice[];
  activeSubsCount: number;
}) {
  const t = useTranslations("admin.revenueMixDonut");
  const formatMoney = useFormatMoney();
  const total = mix.reduce((s, x) => s + x.amount, 0);

  const data: PieEntry[] = mix.map((m, i) => ({
    name: TYPE_LABEL_KEYS[m.type] ? t(TYPE_LABEL_KEYS[m.type]) : m.type,
    value: m.amount,
    color: TYPE_COLORS[m.type] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));

  // Hide slices with 0 value
  const visibleData = data.filter((d) => d.value > 0);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted/70" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
            {t("kicker")}
          </span>
        </div>
        <p className="mt-1 text-[15px] font-semibold text-foreground">
          {formatMoney(total)}
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
          <p className="text-sm text-muted">{t("noRevenue")}</p>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative h-32 w-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={visibleData}
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {visibleData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [
                    formatMoney(Number(value)),
                    String(name),
                  ]}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-muted/70">{t("active")}</span>
              <span className="text-base font-bold tabular-nums">{activeSubsCount}</span>
              <span className="text-[9px] text-muted/60 leading-tight">{t("subs")}</span>
            </div>
          </div>
          <ul className="flex-1 space-y-1.5">
            {visibleData.map((s) => {
              const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
              return (
                <li key={s.name} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="flex-1 truncate text-foreground/80">{s.name}</span>
                  <span className="text-muted/70 tabular-nums">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
