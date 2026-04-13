"use client";

import {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  type PointerEvent as ReactPointerEvent,
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

/* ─── Zoom / Pan container ─── */

const CELL = 42;
const GAP = 8;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const HINT_TIMEOUT = 2500;

interface Point { x: number; y: number }

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function ZoomPanContainer({
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
  const [translate, setTranslate] = useState<Point>({ x: 0, y: 0 });
  const [showHint, setShowHint] = useState(true);
  const [needsZoom, setNeedsZoom] = useState(false);
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  const pointers = useRef(new Map<number, Point>());
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const panStart = useRef<Point | null>(null);
  const panStartTranslate = useRef<Point>({ x: 0, y: 0 });
  const interacted = useRef(false);
  const initialFitScale = useRef(1);

  const fitScale = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return 1;
    const pad = 16;
    const availW = el.clientWidth - pad * 2;
    const availH = el.clientHeight - pad * 2;
    const sX = availW / contentWidth;
    const sY = availH / contentHeight;
    return Math.min(sX, sY, 1);
  }, [contentWidth, contentHeight]);

  useEffect(() => {
    const s = fitScale();
    initialFitScale.current = s;
    setScale(s);
    setIsZoomedIn(false);
    const el = wrapRef.current;
    if (!el) return;
    const cx = (el.clientWidth - contentWidth * s) / 2;
    const cy = (el.clientHeight - contentHeight * s) / 2;
    setTranslate({ x: cx, y: cy });
    setNeedsZoom(s < 0.95);
  }, [fitScale, contentWidth, contentHeight]);

  useEffect(() => {
    if (!needsZoom) { setShowHint(false); return; }
    const t = setTimeout(() => setShowHint(false), HINT_TIMEOUT);
    return () => clearTimeout(t);
  }, [needsZoom]);

  const dismissHint = useCallback(() => {
    if (!interacted.current) { interacted.current = true; setShowHint(false); }
  }, []);

  const dist = (a: Point, b: Point) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const mid = (a: Point, b: Point): Point => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    dismissHint();

    const zoomed = scale > initialFitScale.current * 1.05;
    if (!zoomed && pointers.current.size === 0) {
      return;
    }

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStartDist.current = dist(a, b);
      pinchStartScale.current = scale;
    } else if (pointers.current.size === 1) {
      panStart.current = { x: e.clientX, y: e.clientY };
      panStartTranslate.current = { ...translate };
    }
  }, [scale, translate, dismissHint]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStartDist.current != null) {
      const [a, b] = [...pointers.current.values()];
      const d = dist(a, b);
      const newScale = clamp(
        pinchStartScale.current * (d / pinchStartDist.current),
        MIN_SCALE,
        MAX_SCALE,
      );
      setScale(newScale);
      setIsZoomedIn(newScale > initialFitScale.current * 1.05);

      const center = mid(a, b);
      const el = wrapRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const cx = center.x - rect.left;
        const cy = center.y - rect.top;
        const ratio = newScale / pinchStartScale.current;
        setTranslate({
          x: cx - (cx - panStartTranslate.current.x) * ratio,
          y: cy - (cy - panStartTranslate.current.y) * ratio,
        });
      }
    } else if (pointers.current.size === 1 && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setTranslate({
        x: panStartTranslate.current.x + dx,
        y: panStartTranslate.current.y + dy,
      });
    }
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      pinchStartDist.current = null;
    }
    if (pointers.current.size === 0) {
      panStart.current = null;
    }
    if (pointers.current.size === 1) {
      const [pt] = [...pointers.current.values()];
      panStart.current = pt;
      panStartTranslate.current = { ...translate };
    }
  }, [translate]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    dismissHint();
    const delta = -e.deltaY * 0.002;
    const newScale = clamp(scale + delta, MIN_SCALE, MAX_SCALE);
    const rect = wrapRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const ratio = newScale / scale;
    setScale(newScale);
    setIsZoomedIn(newScale > initialFitScale.current * 1.05);
    setTranslate({
      x: cx - (cx - translate.x) * ratio,
      y: cy - (cy - translate.y) * ratio,
    });
  }, [scale, translate, dismissHint]);

  const containerH = Math.min(
    Math.max(contentHeight * fitScale() + 32, 180),
    400,
  );

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden rounded-xl bg-neutral-50/60"
      style={{ height: containerH, touchAction: isZoomedIn ? "none" : "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          width: contentWidth,
          height: contentHeight,
          willChange: "transform",
        }}
      >
        {children}
      </div>

      {/* Gesture hints */}
      {showHint && needsZoom && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60 transition-opacity duration-500">
          <div className="flex items-center gap-6">
            {/* Pinch icon */}
            <div className="flex flex-col items-center gap-1">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-muted/70">
                <path d="M14 24l-4 4m0 0l-4 4m4-4l-4-4m4 4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M26 24l4 4m0 0l4 4m-4-4l4-4m-4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 14a3 3 0 016 0v10a3 3 0 01-6 0V14z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M21 17a3 3 0 016 0v7a3 3 0 01-6 0v-7z" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span className="text-[10px] font-medium text-muted/60">Zoom</span>
            </div>
            {/* Pan icon */}
            <div className="flex flex-col items-center gap-1">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-muted/70">
                <path d="M8 20h24M20 8v24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M8 20l4-3m-4 3l4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M32 20l-4-3m4 3l-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20 8l-3 4m3-4l3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20 32l-3-4m3 4l3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-[10px] font-medium text-muted/60">Mover</span>
            </div>
          </div>
        </div>
      )}
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
              "border border-neutral-300 text-neutral-500 hover:border-neutral-400 active:scale-95",
            isAvailable && isSelected &&
              "bg-foreground text-background shadow-sm",
            isSelf &&
              "bg-accent text-white ring-2 ring-accent/30",
            isGuest &&
              "bg-emerald-500 text-white ring-2 ring-emerald-300/40",
            isFriend &&
              "ring-0 border-0",
            isBlocked &&
              "bg-red-100 text-red-400 border border-red-300",
            adminMode && isBlocked &&
              "cursor-pointer hover:bg-red-200",
            adminMode && isAvailable &&
              "cursor-pointer hover:border-red-400 hover:bg-red-50",
            !isSelf && !isFriend && !isGuest && isOccupied &&
              "bg-neutral-100 text-neutral-300",
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
              <AvatarFallback className="text-[11px] font-semibold bg-blue-100 text-blue-600">
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
      <ZoomPanContainer contentWidth={gridW} contentHeight={gridH}>
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
      </ZoomPanContainer>
    );
  }

  const spots = Array.from({ length: maxCapacity }, (_, i) => i + 1);
  const fallbackCols = maxCapacity <= 6 ? 3 : maxCapacity <= 9 ? 3 : 4;
  const fallbackRows = Math.ceil(maxCapacity / fallbackCols);
  const fbW = fallbackCols * CELL + (fallbackCols - 1) * GAP;
  const fbH = fallbackRows * CELL + (fallbackRows - 1) * GAP;

  if (maxCapacity > 12) {
    return (
      <ZoomPanContainer contentWidth={fbW} contentHeight={fbH}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${fallbackCols}, ${CELL}px)`,
            gap: `${GAP}px`,
          }}
        >
          {spots.map((num) => renderSpotButton(num, `spot-${num}`))}
        </div>
      </ZoomPanContainer>
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
