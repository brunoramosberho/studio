"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";

export interface SpotInfo {
  status: "self" | "friend" | "occupied";
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
}

export function StudioMap({
  maxCapacity,
  spotMap,
  selectedSpot,
  onSelectSpot,
  myBookedSpot,
  disabled,
  layout,
}: StudioMapProps) {
  const [tapped, setTapped] = useState<number | null>(null);

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
    const isOccupied = !!info;
    const isSelf = info?.status === "self";
    const isFriend = info?.status === "friend";
    const isSelected = selectedSpot === num;
    const isAvailable = !isOccupied;
    const showTooltip = tapped === num && isFriend;

    const initials = info?.userName
      ? info.userName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
      : "?";

    return (
      <div key={key} className="relative flex flex-col items-center">
        <button
          onClick={() => {
            if (isAvailable && !disabled) onSelectSpot(num);
            if (isFriend) setTapped(tapped === num ? null : num);
          }}
          onMouseEnter={() => isFriend && setTapped(num)}
          onMouseLeave={() => isFriend && setTapped(null)}
          disabled={(!isFriend && isOccupied) || (disabled && isAvailable)}
          className={cn(
            "relative flex h-[38px] w-[38px] items-center justify-center rounded-full transition-all overflow-hidden",
            isAvailable && !isSelected &&
              "border border-neutral-300 text-neutral-500 hover:border-neutral-400 active:scale-95",
            isAvailable && isSelected &&
              "bg-foreground text-background shadow-sm",
            isSelf &&
              "bg-accent text-white ring-2 ring-accent/30",
            isFriend &&
              "ring-0 border-0",
            !isSelf && !isFriend && isOccupied &&
              "bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600",
            disabled && isAvailable && "opacity-40 pointer-events-none",
          )}
        >
          {isFriend ? (
            <Avatar className="h-full w-full">
              {info.userImage && <AvatarImage src={info.userImage} className="object-cover" />}
              <AvatarFallback className="text-[11px] font-semibold bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300">
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
    return (
      <div key={key} className="flex flex-col items-center">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-violet-100 text-violet-600">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  // Layout-based rendering
  if (hasLayout) {
    return (
      <div className="space-y-1">
        <div
          className="mx-auto grid justify-center"
          style={{
            gridTemplateColumns: `repeat(${cols}, 42px)`,
            gap: "8px",
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

            // Empty cell
            return <div key={key} className="h-[38px] w-[38px]" />;
          })}
        </div>
        {coachPos && (
          <p className="text-center text-[10px] text-muted/50">Coach</p>
        )}
      </div>
    );
  }

  // Fallback: simple numbered grid
  const spots = Array.from({ length: maxCapacity }, (_, i) => i + 1);
  const fallbackCols = maxCapacity <= 6 ? 3 : maxCapacity <= 9 ? 3 : 4;

  return (
    <div
      className="mx-auto grid justify-center"
      style={{
        gridTemplateColumns: `repeat(${fallbackCols}, 42px)`,
        gap: "8px",
      }}
    >
      {spots.map((num) => renderSpotButton(num, `spot-${num}`))}
    </div>
  );
}
