"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  change?: number;
  accentColor?: string;
  className?: string;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  change,
  accentColor = "var(--color-admin)",
  className,
}: KpiCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="h-0.5" style={{ backgroundColor: accentColor, opacity: 0.3 }} />
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `color-mix(in srgb, ${accentColor} 10%, transparent)` }}
          >
            <Icon
              className="h-5 w-5"
              style={{ color: accentColor }}
            />
          </div>
          {change !== undefined && (
            <div
              className={cn(
                "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                isPositive
                  ? "bg-green-50 text-green-600"
                  : "bg-red-50 text-red-600",
              )}
            >
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(change)}%
            </div>
          )}
        </div>
        <div className="mt-3">
          <p className="font-mono text-2xl font-bold text-foreground sm:text-3xl">
            {value}
          </p>
          <p className="mt-0.5 text-xs text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
