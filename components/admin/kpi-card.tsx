"use client";

import { Card, Metric, Text, BadgeDelta, Flex } from "@tremor/react";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  change?: number;
  className?: string;
}

function deltaType(change?: number) {
  if (change === undefined) return undefined;
  if (change > 0) return "moderateIncrease" as const;
  if (change < 0) return "moderateDecrease" as const;
  return "unchanged" as const;
}

export function KpiCard({ icon: Icon, label, value, change, className }: KpiCardProps) {
  return (
    <Card className={className}>
      <Flex justifyContent="between" alignItems="start">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40">
            <Icon className="h-4.5 w-4.5 text-muted" />
          </div>
          <Text className="text-sm">{label}</Text>
        </div>
        {change !== undefined && (
          <BadgeDelta
            deltaType={deltaType(change)}
            className="text-sm"
          >
            {change > 0 ? "+" : ""}
            {change}%
          </BadgeDelta>
        )}
      </Flex>
      <Metric className="mt-3">{value}</Metric>
    </Card>
  );
}
