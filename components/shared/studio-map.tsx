"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export interface SpotInfo {
  status: "self" | "friend" | "occupied";
  userName?: string | null;
  userImage?: string | null;
}

interface StudioMapProps {
  maxCapacity: number;
  spotMap: Record<number, SpotInfo>;
  selectedSpot: number | null;
  onSelectSpot: (spot: number) => void;
  myBookedSpot?: number | null;
  disabled?: boolean;
}

export function StudioMap({
  maxCapacity,
  spotMap,
  selectedSpot,
  onSelectSpot,
  myBookedSpot,
  disabled,
}: StudioMapProps) {
  const [tapped, setTapped] = useState<number | null>(null);
  const spots = Array.from({ length: maxCapacity }, (_, i) => i + 1);
  const cols = maxCapacity <= 6 ? 3 : maxCapacity <= 9 ? 3 : 4;

  return (
    <div
      className="mx-auto grid justify-center"
      style={{
        gridTemplateColumns: `repeat(${cols}, 42px)`,
        gap: "8px",
      }}
    >
      {spots.map((num) => {
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
          <div key={num} className="relative flex flex-col items-center">
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
                // Available — clear border, visible number
                isAvailable && !isSelected &&
                  "border border-neutral-300 text-neutral-500 hover:border-neutral-400 active:scale-95",
                // Selected — solid fill
                isAvailable && isSelected &&
                  "bg-foreground text-background shadow-sm",
                // Self — accent
                isSelf &&
                  "bg-accent text-white ring-2 ring-accent/30",
                // Friend — avatar fills the circle
                isFriend &&
                  "ring-0 border-0",
                // Occupied (stranger) — very faint
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

            {/* Tooltip on hover/tap for friends */}
            {showTooltip && info?.userName && (
              <div className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background shadow-lg">
                {info.userName.split(" ")[0]}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
