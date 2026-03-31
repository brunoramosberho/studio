"use client";

import { AreaChart, Card } from "@tremor/react";
import { formatCurrency } from "@/lib/utils";

interface RevenueChartProps {
  data: { name: string; revenue: number }[];
  title?: string;
}

export function RevenueChart({ data, title = "Ingresos" }: RevenueChartProps) {
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
          {title}
        </p>
      </div>
      <AreaChart
        className="mt-4 h-64 sm:h-80"
        data={data}
        index="name"
        categories={["revenue"]}
        colors={["amber"]}
        valueFormatter={(v) => formatCurrency(Number(v))}
        yAxisWidth={52}
        showLegend={false}
        curveType="monotone"
      />
    </Card>
  );
}
