import type { Confidence } from "@/lib/onboarding/types";

const config: Record<Confidence, { label: string; className: string }> = {
  high: { label: "Alta", className: "bg-green-50 text-green-700" },
  medium: { label: "Media", className: "bg-amber-50 text-amber-700" },
  low: { label: "Baja", className: "bg-red-50 text-red-600" },
};

export function ConfidenceBadge({ level }: { level: Confidence }) {
  const c = config[level];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.className}`}>
      {c.label}
    </span>
  );
}
