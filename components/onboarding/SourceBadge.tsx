import type { Source } from "@/lib/onboarding/types";

const config: Record<Source, { label: string; className: string }> = {
  website: { label: "Web", className: "bg-blue-50 text-blue-700" },
  instagram: { label: "Instagram", className: "bg-pink-50 text-pink-700" },
  both: { label: "Web + IG", className: "bg-purple-50 text-purple-700" },
};

export function SourceBadge({ source }: { source: Source }) {
  const c = config[source];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.className}`}>
      {c.label}
    </span>
  );
}
