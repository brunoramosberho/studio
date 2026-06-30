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
  /**
   * Reveal every occupant's name/avatar (not just friends/guests) and make
   * occupied spots hoverable + selectable. Used by the admin check-in map so
   * staff can see who is where and highlight a member's spot. In this mode the
   * spots render larger and each occupant's first name is shown beneath their
   * avatar (no hover/tap required).
   */
  revealOccupants?: boolean;
}

/* ─── Auto-fit container ─── */

const GAP = 8;

/** Tracks whether the viewport is desktop (>=768px). The reveal/occupant map
 *  renders roomy with name labels on desktop, but on phones it shrinks to a
 *  compact booking-style size so it fits without horizontal scroll. */
function useIsDesktopViewport() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

/**
 * Scales the room layout down to fit the available width without any gesture
 * handling — no wheel zoom, no pan, no pinch. Trackpad scroll passes through
 * to the page. If the layout already fits, scale stays at 1 (we never zoom in).
 *
 * `minScale` (used by the named admin check-in map) keeps the content from
 * shrinking past a legible size — below that floor the map keeps its size and
 * scrolls horizontally instead, so occupant names stay readable on phones.
 */
function AutoFitContainer({
  children,
  contentWidth,
  contentHeight,
  minScale,
}: {
  children: React.ReactNode;
  contentWidth: number;
  contentHeight: number;
  minScale?: number;
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
      let s = Math.min(availW / contentWidth, 1);
      if (minScale != null) s = Math.max(s, minScale);
      setScale(s);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentWidth, contentHeight, minScale]);

  // When a minimum scale is enforced the content can be wider than the
  // container; allow horizontal panning instead of clipping it.
  const scrollX = minScale != null;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative w-full rounded-xl bg-neutral-50/60 dark:bg-surface",
        scrollX ? "overflow-x-auto overflow-y-hidden" : "overflow-hidden",
      )}
      style={{ touchAction: scrollX ? "pan-x pan-y" : "pan-y" }}
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
  revealOccupants,
}: StudioMapProps) {
  const [tapped, setTapped] = useState<number | null>(null);
  const [coachTapped, setCoachTapped] = useState(false);
  const { coachIconSvg } = useBranding();

  const hasLayout = layout && layout.spots.length > 0;

  // Admin check-in (revealOccupants) uses larger spots with the occupant's
  // first name beneath each one. Booking surfaces keep the compact numbered
  // layout. `cellW`/`cellH` size the grid tracks (cellH reserves room for the
  // name label) so the auto-fit container measures the content correctly.
  const isDesktop = useIsDesktopViewport();
  const reveal = !!revealOccupants;
  // The reveal map (admin check-in / coach roster) always shows the occupant's
  // first name under their avatar so staff can see who is where at a glance —
  // on phones it just renders in a smaller font. Tapping a spot still highlights
  // it + names it below the map for the long names that truncate.
  const showLabels = reveal;
  const avatarSize = reveal ? (isDesktop ? 52 : 40) : 38;
  const cellW = reveal ? (isDesktop ? 76 : 48) : 42;
  const labelH = showLabels ? (isDesktop ? 16 : 12) : 0;
  const cellH = reveal ? avatarSize + 2 + labelH : 42;
  // Only the desktop reveal map keeps the legibility floor (it scrolls instead
  // of shrinking below it). Everywhere else free-shrink to fit the container.
  const mapMinScale = reveal && isDesktop ? 0.75 : undefined;

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
    // In reveal mode (admin check-in) a plain occupied spot becomes an
    // interactive, named avatar that can be hovered and highlighted.
    const revealOccupied =
      !!revealOccupants && isOccupied && !isBlocked && !isSelf && !isGuest && !isFriend;
    const showsIdentity = isFriend || isGuest || revealOccupied;
    // In reveal mode the name is always rendered as a label below the avatar,
    // so the hover/tap tooltip is only needed for friend/guest booking spots.
    const showTooltip = tapped === num && (isFriend || isGuest) && !!info?.userName;

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
            if (revealOccupied) {
              onSelectSpot(num);
              setTapped(tapped === num ? null : num);
              return;
            }
            if (isAvailable && !disabled) onSelectSpot(num);
            if (isFriend || isGuest) setTapped(tapped === num ? null : num);
          }}
          onMouseEnter={() => showsIdentity && setTapped(num)}
          onMouseLeave={() => showsIdentity && setTapped(null)}
          disabled={!adminMode && !revealOccupied && ((!isFriend && !isGuest && (isOccupied || isBlocked)) || (disabled && isAvailable))}
          style={{ height: avatarSize, width: avatarSize }}
          className={cn(
            "relative flex items-center justify-center rounded-full transition-all overflow-hidden",
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
            revealOccupied && "cursor-pointer active:scale-95",
            revealOccupied && isSelected &&
              "ring-2 ring-accent ring-offset-2 ring-offset-background scale-105 shadow-md",
            !adminMode && !revealOccupied && disabled && isAvailable && "opacity-40 pointer-events-none",
          )}
        >
          {isBlocked ? (
            <Lock className="h-4 w-4" />
          ) : isGuest ? (
            <span className="text-[11px] font-semibold">{initials}</span>
          ) : isFriend || revealOccupied ? (
            <Avatar className="h-full w-full">
              {info?.userImage && <AvatarImage src={info.userImage} className="object-cover" />}
              <AvatarFallback
                className={cn(
                  "font-semibold",
                  reveal ? "text-[13px]" : "text-[11px]",
                  isFriend
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
                    : "bg-neutral-200 text-neutral-700 dark:bg-surface dark:text-foreground",
                )}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className={cn("font-medium tabular-nums", reveal ? "text-[15px]" : "text-[13px]")}>{num}</span>
          )}
        </button>

        {showTooltip && info?.userName && (
          <div className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background shadow-lg">
            {info.userName.split(" ")[0]}
          </div>
        )}

        {/* Always-visible occupant first name (reveal map — desktop + mobile) */}
        {showLabels && (
          <span
            className={cn(
              "mt-0.5 block w-full truncate px-0.5 text-center font-medium text-neutral-700 dark:text-foreground",
              isDesktop ? "text-[11px] leading-[16px]" : "text-[9px] leading-[12px]",
            )}
          >
            {info?.userName ? info.userName.split(" ")[0] : ""}
          </span>
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
          className="flex items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ height: avatarSize, width: avatarSize, backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }}
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

        {coachTapped && !reveal && firstName && (
          <div className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background shadow-lg">
            {firstName}
          </div>
        )}

        {/* Always-visible coach name (admin check-in only) */}
        {showLabels && (
          <span className="mt-0.5 block w-full truncate px-0.5 text-center text-[11px] leading-[16px] font-semibold text-accent">
            {firstName ?? ""}
          </span>
        )}
      </div>
    );
  }

  const gridW = cols * cellW + (cols - 1) * GAP;
  const gridH = rows * cellH + (rows - 1) * GAP;

  if (hasLayout) {
    return (
      <AutoFitContainer contentWidth={gridW} contentHeight={gridH} minScale={mapMinScale}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellW}px)`,
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

            return <div key={key} style={{ height: avatarSize, width: avatarSize }} />;
          })}
        </div>
      </AutoFitContainer>
    );
  }

  const spots = Array.from({ length: maxCapacity }, (_, i) => i + 1);
  const fallbackCols = maxCapacity <= 6 ? 3 : maxCapacity <= 9 ? 3 : 4;
  const fallbackRows = Math.ceil(maxCapacity / fallbackCols);
  const fbW = fallbackCols * cellW + (fallbackCols - 1) * GAP;
  const fbH = fallbackRows * cellH + (fallbackRows - 1) * GAP;

  if (maxCapacity > 12) {
    return (
      <AutoFitContainer contentWidth={fbW} contentHeight={fbH} minScale={mapMinScale}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${fallbackCols}, ${cellW}px)`,
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
        gridTemplateColumns: `repeat(${fallbackCols}, ${cellW}px)`,
        gap: `${GAP}px`,
      }}
    >
      {spots.map((num) => renderSpotButton(num, `spot-${num}`))}
    </div>
  );
}
