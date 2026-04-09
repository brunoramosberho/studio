"use client";

import { useState, useId } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";
import { getLoyaltyTierVisual, type LoyaltyTierVisual } from "@/lib/loyalty-tier";

interface LevelInfo {
  name: string;
  icon: string;
  color: string;
  minClasses: number;
  sortOrder: number;
  reached: boolean;
  isCurrent: boolean;
}

interface LevelHexCardProps {
  level: {
    name: string;
    icon: string;
    color: string;
    sortOrder: number;
    minClasses: number;
  };
  nextLevel: {
    name: string;
    icon: string;
    color: string;
    minClasses: number;
    sortOrder: number;
  } | null;
  totalClasses: number;
  classesToNext: number;
  levels: LevelInfo[];
}

const TIER_PALETTE: Record<
  LoyaltyTierVisual,
  { stops: [string, string, string]; icon: string }
> = {
  bronze: {
    stops: ["#daa06d", "#b87333", "#6b3a1e"],
    icon: "rgba(80,40,15,0.4)",
  },
  silver: {
    stops: ["#d1d5db", "#9ca3af", "#6b7280"],
    icon: "rgba(75,85,99,0.35)",
  },
  gold: {
    stops: ["#fde68a", "#d97706", "#78350f"],
    icon: "rgba(120,53,15,0.45)",
  },
  platinum: {
    stops: ["#dde8f5", "#8fa0bc", "#4a5a70"],
    icon: "rgba(59,77,110,0.35)",
  },
  elite: {
    stops: ["#b8b8d4", "#7c7c9a", "#3a3a52"],
    icon: "rgba(46,46,66,0.4)",
  },
};

const HEX_POINTS = "50,8 93,33 93,83 50,108 7,83 7,33";

export function HexBadge({
  tier,
  size,
  coachIconSvg,
  active = true,
  className,
}: {
  tier: LoyaltyTierVisual;
  size: number;
  coachIconSvg: string | null;
  active?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "_");
  const palette = TIER_PALETTE[tier];
  const gradId = `${uid}g`;
  const sheenId = `${uid}s`;
  const h = Math.round(size * 1.16);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{
        width: size,
        height: h,
        opacity: active ? 1 : 0.28,
        filter: active ? "none" : "grayscale(0.8) brightness(1.1)",
      }}
    >
      <svg
        viewBox="0 0 100 116"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor={palette.stops[0]} />
            <stop offset="50%" stopColor={palette.stops[1]} />
            <stop offset="100%" stopColor={palette.stops[2]} />
          </linearGradient>
          <linearGradient id={sheenId} x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.32" />
            <stop offset="45%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="black" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <polygon
          points={HEX_POINTS}
          fill={`url(#${gradId})`}
          stroke={`url(#${gradId})`}
          strokeWidth="12"
          strokeLinejoin="round"
          paintOrder="stroke"
        />
        <polygon
          points={HEX_POINTS}
          fill={`url(#${sheenId})`}
          stroke={`url(#${sheenId})`}
          strokeWidth="12"
          strokeLinejoin="round"
          paintOrder="stroke"
        />
      </svg>
      {coachIconSvg && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ padding: "27%" }}
        >
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            style={{ color: palette.icon }}
            dangerouslySetInnerHTML={{ __html: coachIconSvg }}
          />
        </div>
      )}
    </div>
  );
}

export function LevelHexCard({
  level,
  nextLevel,
  totalClasses,
  classesToNext,
  levels,
}: LevelHexCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { coachIconSvg } = useBranding();
  const currentTier = getLoyaltyTierVisual(level.name);
  const palette = TIER_PALETTE[currentTier];

  const currentIdx = levels.findIndex((l) => l.isCurrent);
  const currentMin = levels[currentIdx]?.minClasses ?? 0;
  const nextMin = nextLevel?.minClasses ?? currentMin + 1;
  const segmentProgress = nextLevel
    ? Math.min(1, (totalClasses - currentMin) / (nextMin - currentMin))
    : 1;

  return (
    <div
      className="cursor-pointer select-none rounded-2xl border border-border/50 bg-gradient-to-b from-white to-surface/80 p-4 shadow-warm-sm transition-all active:scale-[0.995]"
      onClick={() => setExpanded((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
    >
      {/* Collapsed header */}
      <div className="flex items-center gap-3.5">
        <HexBadge
          tier={currentTier}
          size={48}
          coachIconSvg={coachIconSvg}
          active
        />
        <div className="min-w-0 flex-1">
          <span
            className="font-display text-sm font-bold uppercase tracking-wider"
            style={{
              background: `linear-gradient(135deg, ${palette.stops[0]}, ${palette.stops[1]}, ${palette.stops[2]})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {level.name}
          </span>
          <div className="mt-1.5 h-1.5 rounded-full bg-surface">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${segmentProgress * 100}%`,
                backgroundColor: level.color,
              }}
            />
          </div>
          {nextLevel ? (
            <p className="mt-1 text-[11px] text-muted">
              <strong className="text-foreground">{classesToNext}</strong> para{" "}
              <span className="font-medium">{nextLevel.name}</span>
            </p>
          ) : (
            <p className="mt-1 text-[11px] font-medium text-foreground">
              Nivel máximo
            </p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </div>

      {/* Expanded: total + all levels */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pt-4">
              <p className="mb-3 text-center text-[11px] text-muted">
                Total:{" "}
                <strong className="text-foreground">{totalClasses}</strong>{" "}
                clases
              </p>

              {levels.length > 1 && (
                <div className="flex items-end justify-between px-1">
                  {levels.map((l) => {
                    const t = getLoyaltyTierVisual(l.name);
                    return (
                      <div
                        key={l.name}
                        className="flex flex-col items-center gap-0.5"
                      >
                        <HexBadge
                          tier={t}
                          size={l.isCurrent ? 38 : 30}
                          coachIconSvg={coachIconSvg}
                          active={l.reached}
                        />
                        <span
                          className={cn(
                            "mt-0.5 text-center text-[8px] font-semibold uppercase tracking-tight",
                            l.reached ? "text-foreground" : "text-muted",
                          )}
                        >
                          {l.name}
                        </span>
                        <span className="text-[8px] text-muted">
                          {l.minClasses} clases
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
