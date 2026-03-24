"use client";

import { useState, useCallback } from "react";
import { Plus, Minus, Eraser, User, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RoomLayoutSpot {
  spot: number;
  row: number;
  col: number;
}

export interface RoomLayout {
  rows: number;
  cols: number;
  spots: RoomLayoutSpot[];
  coachPosition: { row: number; col: number } | null;
}

type Tool = "spot" | "coach" | "eraser";

interface RoomLayoutEditorProps {
  value: RoomLayout;
  onChange: (layout: RoomLayout) => void;
}

const MIN_SIZE = 2;
const MAX_SIZE = 10;

export function RoomLayoutEditor({ value, onChange }: RoomLayoutEditorProps) {
  const [tool, setTool] = useState<Tool>("spot");

  const { rows, cols, spots, coachPosition } = value;

  const spotAt = useCallback(
    (r: number, c: number) => spots.find((s) => s.row === r && s.col === c),
    [spots],
  );

  const isCoachAt = useCallback(
    (r: number, c: number) =>
      coachPosition != null && coachPosition.row === r && coachPosition.col === c,
    [coachPosition],
  );

  function handleCellClick(r: number, c: number) {
    const existing = spotAt(r, c);
    const isCoach = isCoachAt(r, c);

    if (tool === "eraser") {
      if (isCoach) {
        onChange({ ...value, coachPosition: null });
      } else if (existing) {
        const removed = spots.filter((s) => !(s.row === r && s.col === c));
        const renumbered = removed.map((s, i) => ({ ...s, spot: i + 1 }));
        onChange({ ...value, spots: renumbered });
      }
      return;
    }

    if (tool === "coach") {
      if (existing) {
        const removed = spots.filter((s) => !(s.row === r && s.col === c));
        const renumbered = removed.map((s, i) => ({ ...s, spot: i + 1 }));
        onChange({ ...value, spots: renumbered, coachPosition: { row: r, col: c } });
      } else {
        onChange({ ...value, coachPosition: { row: r, col: c } });
      }
      return;
    }

    // tool === "spot"
    if (isCoach) {
      onChange({
        ...value,
        coachPosition: null,
        spots: [...spots, { spot: spots.length + 1, row: r, col: c }],
      });
    } else if (existing) {
      // already a spot — do nothing (could toggle off, but let's use eraser for that)
    } else {
      onChange({
        ...value,
        spots: [...spots, { spot: spots.length + 1, row: r, col: c }],
      });
    }
  }

  function changeRows(delta: number) {
    const newRows = Math.min(MAX_SIZE, Math.max(MIN_SIZE, rows + delta));
    if (newRows === rows) return;
    if (delta < 0) {
      const filtered = spots.filter((s) => s.row < newRows);
      const renumbered = filtered.map((s, i) => ({ ...s, spot: i + 1 }));
      const newCoach =
        coachPosition && coachPosition.row >= newRows ? null : coachPosition;
      onChange({ ...value, rows: newRows, spots: renumbered, coachPosition: newCoach });
    } else {
      onChange({ ...value, rows: newRows });
    }
  }

  function changeCols(delta: number) {
    const newCols = Math.min(MAX_SIZE, Math.max(MIN_SIZE, cols + delta));
    if (newCols === cols) return;
    if (delta < 0) {
      const filtered = spots.filter((s) => s.col < newCols);
      const renumbered = filtered.map((s, i) => ({ ...s, spot: i + 1 }));
      const newCoach =
        coachPosition && coachPosition.col >= newCols ? null : coachPosition;
      onChange({ ...value, rows, cols: newCols, spots: renumbered, coachPosition: newCoach });
    } else {
      onChange({ ...value, cols: newCols });
    }
  }

  function clearAll() {
    onChange({ ...value, spots: [], coachPosition: null });
  }

  const tools: { id: Tool; label: string; icon: typeof Hash }[] = [
    { id: "spot", label: "Lugar", icon: Hash },
    { id: "coach", label: "Coach", icon: User },
    { id: "eraser", label: "Borrar", icon: Eraser },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTool(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tool === t.id
                ? t.id === "coach"
                  ? "bg-violet-100 text-violet-700"
                  : t.id === "eraser"
                    ? "bg-red-50 text-red-600"
                    : "bg-admin/10 text-admin"
                : "bg-surface text-muted hover:text-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}

        <div className="ml-auto">
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-red-50 hover:text-red-600"
          >
            Limpiar todo
          </button>
        </div>
      </div>

      {/* Grid size controls */}
      <div className="flex items-center gap-4 text-xs text-muted">
        <div className="flex items-center gap-2">
          <span className="font-medium">Filas: {rows}</span>
          <button
            type="button"
            onClick={() => changeRows(-1)}
            disabled={rows <= MIN_SIZE}
            className="rounded p-0.5 hover:bg-surface disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => changeRows(1)}
            disabled={rows >= MAX_SIZE}
            className="rounded p-0.5 hover:bg-surface disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Columnas: {cols}</span>
          <button
            type="button"
            onClick={() => changeCols(-1)}
            disabled={cols <= MIN_SIZE}
            className="rounded p-0.5 hover:bg-surface disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => changeCols(1)}
            disabled={cols >= MAX_SIZE}
            className="rounded p-0.5 hover:bg-surface disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="ml-auto tabular-nums">
          {spots.length} lugares
          {coachPosition ? " · coach ✓" : ""}
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-border/50 bg-white p-4">
        <div
          className="mx-auto grid justify-center"
          style={{
            gridTemplateColumns: `repeat(${cols}, 44px)`,
            gap: "6px",
          }}
        >
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const spot = spotAt(r, c);
            const isCoach = isCoachAt(r, c);

            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={() => handleCellClick(r, c)}
                className={cn(
                  "flex h-[40px] w-[40px] items-center justify-center rounded-lg text-xs font-semibold transition-all",
                  // Coach position
                  isCoach &&
                    "bg-violet-500 text-white shadow-sm",
                  // Spot
                  spot &&
                    !isCoach &&
                    "bg-admin/15 text-admin border border-admin/20",
                  // Empty
                  !spot &&
                    !isCoach &&
                    "border border-dashed border-border text-muted/30 hover:border-muted hover:bg-surface/50",
                  // Cursor based on tool
                  tool === "eraser" && (spot || isCoach)
                    ? "cursor-pointer hover:bg-red-50 hover:border-red-200"
                    : tool === "coach" && !isCoach
                      ? "cursor-pointer"
                      : tool === "spot" && !spot && !isCoach
                        ? "cursor-pointer"
                        : "",
                )}
              >
                {isCoach ? (
                  <User className="h-4 w-4" />
                ) : spot ? (
                  <span className="tabular-nums">{spot.spot}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Coach label */}
        <div className="mt-4 flex items-center justify-center gap-6 text-[10px] text-muted">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-admin/15 border border-admin/20" />
            <span>Lugar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-violet-500" />
            <span>Coach</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded border border-dashed border-border" />
            <span>Vacío</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function createEmptyLayout(rows = 4, cols = 4): RoomLayout {
  return { rows, cols, spots: [], coachPosition: null };
}
