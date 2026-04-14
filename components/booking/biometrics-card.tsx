"use client";

import { useQuery } from "@tanstack/react-query";
import { Flame, Heart, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface BiometricsData {
  id: string;
  provider: string;
  calories: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  createdAt: string;
}

function StravaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116zm-3.08-8.399l2.086 4.116h3.065L12.304 3.614v.001l-5.154 10.172h3.066l2.091-4.242z" />
    </svg>
  );
}

interface BiometricsCardProps {
  bookingId: string;
  variant?: "standalone" | "inline";
}

export function BiometricsCard({ bookingId, variant = "standalone" }: BiometricsCardProps) {
  const { data: biometrics } = useQuery<BiometricsData | null>({
    queryKey: ["biometrics", bookingId],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${bookingId}/biometrics`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!bookingId,
  });

  if (!biometrics) return null;

  const hasAnyData = biometrics.calories || biometrics.hrAvg || biometrics.hrMax;
  if (!hasAnyData) return null;

  const stats = [
    biometrics.calories != null && biometrics.calories > 0 && {
      icon: <Flame className="h-3.5 w-3.5 text-orange-500" />,
      value: Math.round(biometrics.calories),
      unit: "kcal",
    },
    biometrics.hrAvg != null && biometrics.hrAvg > 0 && {
      icon: <Heart className="h-3.5 w-3.5 text-rose-400" />,
      value: Math.round(biometrics.hrAvg),
      unit: "avg",
    },
    biometrics.hrMax != null && biometrics.hrMax > 0 && {
      icon: <Heart className="h-3.5 w-3.5 text-rose-600" />,
      value: Math.round(biometrics.hrMax),
      unit: "max",
    },
  ].filter(Boolean) as { icon: React.ReactNode; value: number; unit: string }[];

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3 border-t border-border/30 px-4 pb-3 pt-2.5">
        <div className="flex items-center gap-3 flex-1">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {s.icon}
              <span className="text-[13px] font-semibold tabular-nums text-foreground">
                {s.value}
              </span>
              <span className="text-[10px] text-muted">{s.unit}</span>
            </div>
          ))}
        </div>
        <span className="flex items-center gap-1 text-[10px] text-muted/70">
          <StravaIcon className="h-2.5 w-2.5 text-[#FC4C02]" />
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-orange-600" />
          <span className="text-[13px] font-semibold text-foreground">
            Tu actividad
          </span>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-muted">
          vía <StravaIcon className="inline h-3 w-3 text-[#FC4C02]" /> Strava
        </span>
      </div>

      <div className={cn("grid gap-2", stats.length === 3 ? "grid-cols-3" : stats.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {stats.map((s, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5 rounded-xl bg-surface/60 px-3 py-3">
            {s.icon}
            <span className="mt-0.5 font-mono text-[20px] font-bold leading-tight text-foreground">
              {s.value}
            </span>
            <span className="text-[10px] font-medium text-muted">{s.unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
