"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SLOT_MINUTES } from "@/lib/availability";

interface TimeRangePickerProps {
  startMin: number;
  endMin: number;
  minMin: number; // tenant studio open in minutes since midnight
  maxMin: number; // tenant studio close in minutes since midnight
  onChange: (next: { startMin: number; endMin: number }) => void;
  disabled?: boolean;
}

function format(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Two-select time picker that snaps to 15-minute boundaries between the
 * tenant's studio open/close hours. Used both in the recurring availability
 * tab and the time-off modal.
 *
 * Invariants:
 *  - start < end (UI prevents picking otherwise)
 *  - both are multiples of 15
 *  - both fall inside [minMin, maxMin]
 */
export function TimeRangePicker({
  startMin,
  endMin,
  minMin,
  maxMin,
  onChange,
  disabled,
}: TimeRangePickerProps) {
  const startOptions = useMemo(() => {
    const opts: number[] = [];
    for (let m = minMin; m < maxMin; m += SLOT_MINUTES) opts.push(m);
    return opts;
  }, [minMin, maxMin]);

  const endOptions = useMemo(() => {
    const opts: number[] = [];
    for (let m = startMin + SLOT_MINUTES; m <= maxMin; m += SLOT_MINUTES) {
      opts.push(m);
    }
    return opts;
  }, [startMin, maxMin]);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={String(startMin)}
        disabled={disabled}
        onValueChange={(v) => {
          const next = parseInt(v, 10);
          const nextEnd = endMin <= next ? next + SLOT_MINUTES : endMin;
          onChange({ startMin: next, endMin: Math.min(nextEnd, maxMin) });
        }}
      >
        <SelectTrigger className="h-9 w-[88px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {startOptions.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {format(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground text-sm">–</span>
      <Select
        value={String(endMin)}
        disabled={disabled}
        onValueChange={(v) => onChange({ startMin, endMin: parseInt(v, 10) })}
      >
        <SelectTrigger className="h-9 w-[88px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {endOptions.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {format(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ChevronDown className="text-muted-foreground hidden h-4 w-4 sm:block" />
    </div>
  );
}

export { format as formatMinutes };
