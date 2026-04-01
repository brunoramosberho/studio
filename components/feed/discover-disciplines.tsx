"use client";

import { useState, useRef } from "react";
import { getIconComponent } from "@/components/admin/icon-picker";
import { Dumbbell, Flame } from "lucide-react";
import { useBranding } from "@/components/branding-provider";
import { DisciplineSheet, type DisciplineData } from "./discipline-sheet";

interface Discipline {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  icon?: string | null;
  mediaUrl?: string | null;
  tags: string[];
  duration: number;
  level: string;
}

interface DiscoverDisciplinesProps {
  disciplines: Discipline[];
}

const LEVEL_FLAMES: Record<string, number> = {
  ALL: 3,
  BEGINNER: 1,
  INTERMEDIATE: 3,
  ADVANCED: 5,
};

function isVideo(url: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

export function DiscoverDisciplines({ disciplines }: DiscoverDisciplinesProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<DisciplineData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { colorFg } = useBranding();

  if (disciplines.length === 0) return null;

  function openDetail(d: Discipline) {
    setSelected({
      name: d.name,
      description: d.description,
      color: d.color,
      icon: d.icon,
      mediaUrl: d.mediaUrl,
      tags: d.tags,
      duration: d.duration,
      level: d.level,
    });
    setSheetOpen(true);
  }

  return (
    <section>
      <h2 className="mb-3 font-display text-[17px] font-bold text-foreground">
        Descubre nuestras disciplinas
      </h2>

      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pr-4 scrollbar-none"
      >
        {disciplines.map((d) => {
          const Icon = d.icon ? getIconComponent(d.icon) : null;
          const flames = LEVEL_FLAMES[d.level] ?? 3;

          return (
            <button
              key={d.id}
              type="button"
              onClick={() => openDetail(d)}
              className="flex w-[72vw] max-w-[280px] shrink-0 snap-start flex-col"
            >
              <div
                className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl"
                style={!d.mediaUrl ? { backgroundColor: d.color } : undefined}
              >
                {d.mediaUrl && isVideo(d.mediaUrl) ? (
                  <video
                    src={d.mediaUrl}
                    muted
                    playsInline
                    loop
                    autoPlay
                    className="h-full w-full object-cover"
                  />
                ) : d.mediaUrl ? (
                  <img
                    src={d.mediaUrl}
                    alt={d.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    {Icon ? (
                      <Icon className="h-12 w-12 text-white/25" />
                    ) : (
                      <Dumbbell className="h-12 w-12 text-white/25" />
                    )}
                  </div>
                )}

                {/* Bottom pills over image */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                  {/* Icon pill */}
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm"
                  >
                    {Icon ? (
                      <Icon className="h-4 w-4" style={{ color: d.color }} />
                    ) : (
                      <Dumbbell className="h-4 w-4" style={{ color: d.color }} />
                    )}
                  </div>

                  {/* Intensity flames */}
                  <div className="flex items-center rounded-full bg-white px-2 py-1 shadow-sm">
                    {Array.from({ length: flames }).map((_, i) => (
                      <Flame key={i} className="h-3.5 w-3.5" style={{ fill: d.color, color: d.color }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Title + duration */}
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <p className="truncate text-left text-[14px] font-semibold text-foreground">
                  {d.name}
                </p>
                <span className="shrink-0 text-[12px] text-muted">
                  {d.duration} min
                </span>
              </div>

              {/* Tags (max 3) */}
              {d.tags.length > 0 && (
                <div className="mt-1 flex gap-1 overflow-hidden">
                  {d.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: `${d.color}12`,
                        color: d.color,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <DisciplineSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        discipline={selected}
      />
    </section>
  );
}
