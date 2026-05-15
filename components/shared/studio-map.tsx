"use client";

import {
  useState,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User, Lock } from "lucide-react";
import { useBranding } from "@/components/branding-provider";

export interface SpotInfo {
  status: "self" | "friend" | "occupied" | "blocked" | "guest";
  userName?: string | null;
  userImage?: string | null;
}

export interface RoomLayoutData {
  rows: number;
  cols: number;
  spots: { spot: number; row: number; col: number }[];
  coachPosition: { row: number; col: number } | null;
}

interface StudioMapProps {
  maxCapacity: number;
  spotMap: Record<number, SpotInfo>;
  selectedSpot: number | null;
  onSelectSpot: (spot: number) => void;
  myBookedSpot?: number | null;
  disabled?: boolean;
  layout?: RoomLayoutData | null;
  coachName?: string | null;
  adminMode?: boolean;
  onToggleBlock?: (spot: number) => void;
}

/* ─── Auto-fit container ─── */

const CELL = 42;
const GAP = 8;

/**
 * Scales the room layout down to fit the available width without any gesture
 * handling — no wheel zoom, no pan, no pinch. Trackpad scroll passes through
 * to the page. If the layout already fits, scale stays at 1 (we never zoom in).
 */
function AutoFitContainer({
  children,
  contentWidth,
  contentHeight,
}: {
  children: React.ReactNode;
  contentWidth: number;
  contentHeight: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const recompute = () => {
      const pad = 16;
      const availW = el.clientWidth - pad * 2;
      if (availW <= 0) return;
      const s = Math.min(availW / contentWidth, 1);
      setScale(s);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentWidth, contentHeight]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden rounded-xl bg-neutral-50/60 dark:bg-surface"
      style={{ touchAction: "pan-y" }}
    >
      <div
        className="mx-auto"
        style={{
          width: contentWidth * scale,
          height: contentHeight * scale,
          padding: 16,
          boxSizing: "content-box",
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            width: contentWidth,
            height: contentHeight,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function StudioMap({
  maxCapacity,
  spotMap,
  selectedSpot,
  onSelectSpot,
  myBookedSpot,
  disabled,
  layout,
  coachName,
  adminMode,
  onToggleBlock,
}: StudioMapProps) {
  const [tapped, setTapped] = useState<number | null>(null);
  const [coachTapped, setCoachTapped] = useState(false);
  const { coachIconSvg } = useBranding();

  const hasLayout = layout && layout.spots.length > 0;

  const { rows, cols, grid } = useMemo(() => {
    if (hasLayout) {
      return {
        rows: layout.rows,
        cols: layout.cols,
        grid: null,
      };
    }
    const c = maxCapacity <= 6 ? 3 : maxCapacity <= 9 ? 3 : 4;
    return { rows: Math.ceil(maxCapacity / c), cols: c, grid: null };
  }, [hasLayout, layout, maxCapacity]);

  const spotByPos = useMemo(() => {
    if (!hasLayout) return null;
    const map = new Map<string, number>();
    for (const s of layout.spots) {
      map.set(`${s.row}-${s.col}`, s.spot);
    }
    return map;
  }, [hasLayout, layout]);

  const coachPos = hasLayout ? layout.coachPosition : null;

  function renderSpotButton(num: number, key: string) {
    const info = spotMap[num];
    const isBlocked = info?.status === "blocked";
    const isGuest = info?.status === "guest";
    const isOccupied = !!info && !isBlocked;
    const isSelf = info?.status === "self";
    const isFriend = info?.status === "friend";
    const isSelected = selectedSpot === num;
    const isAvailable = !isOccupied && !isBlocked;
    const showTooltip = tapped === num && (isFriend || isGuest);

    const initials = info?.userName
      ? info.userName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
      : "?";

    return (
      <div key={key} className="relative flex flex-col items-center">
        <button
          onClick={() => {
            if (adminMode && onToggleBlock) {
              onToggleBlock(num);
              return;
            }
            if (isAvailable && !disabled) onSelectSpot(num);
            if (isFriend || isGuest) setTapped(tapped === num ? null : num);
          }}
          onMouseEnter={() => (isFriend || isGuest) && setTapped(num)}
          onMouseLeave={() => (isFriend || isGuest) && setTapped(null)}
          disabled={!adminMode && ((!isFriend && !isGuest && (isOccupied || isBlocked)) || (disabled && isAvailable))}
          className={cn(
            "relative flex h-[38px] w-[38px] items-center justify-center rounded-full transition-all overflow-hidden",
            isAvailable && !isSelected &&
              "border border-neutral-300 text-neutral-500 hover:border-neutral-400 active:scale-95 dark:border-border dark:text-muted dark:hover:border-muted/60",
            isAvailable && isSelected &&
              "bg-foreground text-background shadow-sm",
            isSelf &&
              "bg-accent text-white ring-2 ring-accent/30",
            isGuest &&
              "bg-emerald-500 text-white ring-2 ring-emerald-300/40",
            isFriend &&
              "ring-0 border-0",
            isBlocked &&
              "bg-red-100 text-red-400 border border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
            adminMode && isBlocked &&
              "cursor-pointer hover:bg-red-200 dark:hover:bg-red-500/25",
            adminMode && isAvailable &&
              "cursor-pointer hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-500/10",
            !isSelf && !isFriend && !isGuest && isOccupied &&
              "bg-neutral-100 text-neutral-300 dark:bg-card dark:text-muted/40 dark:border dark:border-border/60",
            !adminMode && disabled && isAvailable && "opacity-40 pointer-events-none",
          )}
        >
          {isBlocked ? (
            <Lock className="h-4 w-4" />
          ) : isGuest ? (
            <span className="text-[11px] font-semibold">{initials}</span>
          ) : isFriend ? (
            <Avatar className="h-full w-full">
              {info.userImage && <AvatarImage src={info.userImage} className="object-cover" />}
              <AvatarFallback className="text-[11px] font-semibold bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
                {initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className="text-[13px] font-medium tabular-nums">{num}</span>
          )}
        </button>

        {showTooltip && info?.userName && (
          <div className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background shadow-lg">
            {info.userName.split(" ")[0]}
          </div>
        )}
      </div>
    );
  }

  function renderCoachCell(key: string) {
    const firstName = coachName?.split(" ")[0] ?? null;

    return (
      <div key={key} className="relative flex flex-col items-center">
        <button
          type="button"
          onClick={() => setCoachTapped((v) => !v)}
          onMouseEnter={() => setCoachTapped(true)}
          onMouseLeave={() => setCoachTapped(false)}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }}
        >
          {coachIconSvg ? (
            <div
              className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: coachIconSvg }}
            />
          ) : (
            <User className="h-4 w-4" />
          )}
        </button>

        {coachTapped && firstName && (
          <div className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background shadow-lg">
            {firstName}
          </div>
        )}
      </div>
    );
  }

  const gridW = cols * CELL + (cols - 1) * GAP;
  const gridH = rows * CELL + (rows - 1) * GAP;

  if (hasLayout) {
    return (
      <AutoFitContainer contentWidth={gridW} contentHeight={gridH}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
            gap: `${GAP}px`,
          }}
        >
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const key = `${r}-${c}`;

            if (coachPos && coachPos.row === r && coachPos.col === c) {
              return renderCoachCell(key);
            }

            const spotNum = spotByPos?.get(key);
            if (spotNum != null) {
              return renderSpotButton(spotNum, key);
            }

            return <div key={key} className="h-[38px] w-[38px]" />;
          })}
        </div>
      </AutoFitContainer>
    );
  }

  const spots = Array.from({ length: maxCapacity }, (_, i) => i + 1);
  const fallbackCols = maxCapacity <= 6 ? 3 : maxCapacity <= 9 ? 3 : 4;
  const fallbackRows = Math.ceil(maxCapacity / fallbackCols);
  const fbW = fallbackCols * CELL + (fallbackCols - 1) * GAP;
  const fbH = fallbackRows * CELL + (fallbackRows - 1) * GAP;

  if (maxCapacity > 12) {
    return (
      <AutoFitContainer contentWidth={fbW} contentHeight={fbH}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${fallbackCols}, ${CELL}px)`,
            gap: `${GAP}px`,
          }}
        >
          {spots.map((num) => renderSpotButton(num, `spot-${num}`))}
        </div>
      </AutoFitContainer>
    );
  }

  return (
    <div
      className="mx-auto grid justify-center"
      style={{
        gridTemplateColumns: `repeat(${fallbackCols}, ${CELL}px)`,
        gap: `${GAP}px`,
      }}
    >
      {spots.map((num) => renderSpotButton(num, `spot-${num}`))}
    </div>
  );
}
