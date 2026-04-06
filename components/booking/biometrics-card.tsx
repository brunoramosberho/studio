"use client";

import { useQuery } from "@tanstack/react-query";
import { Flame, Heart, Activity } from "lucide-react";

interface BiometricsData {
  id: string;
  provider: string;
  calories: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  createdAt: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  STRAVA: "Strava",
};

function StravaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116zm-3.08-8.399l2.086 4.116h3.065L12.304 3.614v.001l-5.154 10.172h3.066l2.091-4.242z" />
    </svg>
  );
}

export function BiometricsCard({ bookingId }: { bookingId: string }) {
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

  const providerLabel = PROVIDER_LABELS[biometrics.provider] ?? biometrics.provider;

  return (
    <div className="rounded-xl border border-orange-200/60 bg-gradient-to-br from-orange-50/80 to-amber-50/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-orange-600" />
        <span className="text-[13px] font-semibold text-foreground">
          Tu actividad
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted">
          vía <StravaIcon className="inline h-3 w-3 text-[#FC4C02]" /> {providerLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {biometrics.calories != null && biometrics.calories > 0 && (
          <div className="flex flex-col items-center gap-1 rounded-lg bg-white/70 px-2 py-2.5">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="font-mono text-lg font-bold text-foreground">
              {Math.round(biometrics.calories)}
            </span>
            <span className="text-[10px] text-muted">kcal</span>
          </div>
        )}

        {biometrics.hrAvg != null && biometrics.hrAvg > 0 && (
          <div className="flex flex-col items-center gap-1 rounded-lg bg-white/70 px-2 py-2.5">
            <Heart className="h-4 w-4 text-red-400" />
            <span className="font-mono text-lg font-bold text-foreground">
              {Math.round(biometrics.hrAvg)}
            </span>
            <span className="text-[10px] text-muted">bpm avg</span>
          </div>
        )}

        {biometrics.hrMax != null && biometrics.hrMax > 0 && (
          <div className="flex flex-col items-center gap-1 rounded-lg bg-white/70 px-2 py-2.5">
            <Heart className="h-4 w-4 text-red-600" />
            <span className="font-mono text-lg font-bold text-foreground">
              {Math.round(biometrics.hrMax)}
            </span>
            <span className="text-[10px] text-muted">bpm max</span>
          </div>
        )}
      </div>
    </div>
  );
}
