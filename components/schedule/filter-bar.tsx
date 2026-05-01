"use client";

import { X } from "lucide-react";
import { cn, getLevelLabel } from "@/lib/utils";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import type { ClassType, CoachProfile, User, Level } from "@/types";
import type { ScheduleFilters } from "@/types";

const TIME_OF_DAY_OPTIONS = [
  { value: "morning", label: "Mañana" },
  { value: "afternoon", label: "Tarde" },
  { value: "evening", label: "Noche" },
] as const;

const LEVEL_OPTIONS: Level[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL"];

interface FilterBarProps {
  classTypes: ClassType[];
  coaches: (CoachProfile & { user?: Pick<User, "name" | "image"> | null })[];
  filters: ScheduleFilters;
  onFilterChange: (filters: Partial<ScheduleFilters>) => void;
  onClear: () => void;
  className?: string;
  hideCoachFilter?: boolean;
}

export function FilterBar({
  classTypes,
  coaches,
  filters,
  onFilterChange,
  onClear,
  className,
  hideCoachFilter = false,
}: FilterBarProps) {
  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div
      className={cn(
        "flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none",
        "-mx-4 px-4 md:mx-0 md:px-0",
        className,
      )}
    >
      {/* Class Type */}
      <FilterPill>
        <Select
          value={filters.classTypeId ?? ""}
          onValueChange={(v) =>
            onFilterChange({ classTypeId: v || undefined })
          }
        >
          <SelectTrigger className="h-9 min-w-[120px] rounded-full border border-border bg-card px-3.5 py-0 text-sm font-body shadow-[var(--shadow-warm-sm)] transition-colors data-[state=open]:border-accent data-[state=open]:bg-accent/5 [&>svg]:ml-1 [&>svg]:h-3.5 [&>svg]:w-3.5">
            <SelectValue placeholder="Clase" />
          </SelectTrigger>
          <SelectContent>
            {classTypes.map((ct) => (
              <SelectItem key={ct.id} value={ct.id}>
                {ct.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterPill>

      {/* Coach */}
      {!hideCoachFilter && (
        <FilterPill>
          <Select
            value={filters.coachId ?? ""}
            onValueChange={(v) => onFilterChange({ coachId: v || undefined })}
          >
            <SelectTrigger className="h-9 min-w-[120px] rounded-full border border-border bg-card px-3.5 py-0 text-sm font-body shadow-[var(--shadow-warm-sm)] transition-colors data-[state=open]:border-accent data-[state=open]:bg-accent/5 [&>svg]:ml-1 [&>svg]:h-3.5 [&>svg]:w-3.5">
              <SelectValue placeholder="Coach" />
            </SelectTrigger>
            <SelectContent>
              {coaches.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterPill>
      )}

      {/* Level */}
      <FilterPill>
        <Select
          value={filters.level ?? ""}
          onValueChange={(v) =>
            onFilterChange({ level: (v as Level) || undefined })
          }
        >
          <SelectTrigger className="h-9 min-w-[120px] rounded-full border border-border bg-card px-3.5 py-0 text-sm font-body shadow-[var(--shadow-warm-sm)] transition-colors data-[state=open]:border-accent data-[state=open]:bg-accent/5 [&>svg]:ml-1 [&>svg]:h-3.5 [&>svg]:w-3.5">
            <SelectValue placeholder="Nivel" />
          </SelectTrigger>
          <SelectContent>
            {LEVEL_OPTIONS.map((level) => (
              <SelectItem key={level} value={level}>
                {getLevelLabel(level)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterPill>

      {/* Time of Day */}
      <FilterPill>
        <Select
          value={filters.timeOfDay ?? ""}
          onValueChange={(v) =>
            onFilterChange({
              timeOfDay: (v as ScheduleFilters["timeOfDay"]) || undefined,
            })
          }
        >
          <SelectTrigger className="h-9 min-w-[120px] rounded-full border border-border bg-card px-3.5 py-0 text-sm font-body shadow-[var(--shadow-warm-sm)] transition-colors data-[state=open]:border-accent data-[state=open]:bg-accent/5 [&>svg]:ml-1 [&>svg]:h-3.5 [&>svg]:w-3.5">
            <SelectValue placeholder="Horario" />
          </SelectTrigger>
          <SelectContent>
            {TIME_OF_DAY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterPill>

      {/* Clear */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 px-3.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
        >
          <X className="h-3.5 w-3.5" />
          Limpiar
        </button>
      )}
    </div>
  );
}

function FilterPill({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0">{children}</div>;
}
