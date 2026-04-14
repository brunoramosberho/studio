"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfidenceBadge } from "@/components/onboarding/ConfidenceBadge";
import { SourceBadge } from "@/components/onboarding/SourceBadge";
import type { ExtractedDiscipline } from "@/lib/onboarding/types";
import {
  Dumbbell, Plus, Trash2, ChevronDown, ChevronUp,
  HeartPulse, Flame, Zap, Activity, TrendingUp,
  PersonStanding, Accessibility, StretchHorizontal,
  Bike, Footprints, Swords, Shield, Music, Disc,
  Waves, Sparkles, Snowflake, Thermometer, Bath, Leaf,
  Users, Target, Crosshair, Brain, Wind, Moon,
  Star, CircleDot, Sun, Mountain, Trophy, type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  "dumbbell": Dumbbell,
  "heart-pulse": HeartPulse,
  "flame": Flame,
  "zap": Zap,
  "activity": Activity,
  "trending-up": TrendingUp,
  "person-standing": PersonStanding,
  "accessibility": Accessibility,
  "stretch-horizontal": StretchHorizontal,
  "bike": Bike,
  "footprints": Footprints,
  "swords": Swords,
  "shield": Shield,
  "music": Music,
  "disc": Disc,
  "waves": Waves,
  "sparkles": Sparkles,
  "snowflake": Snowflake,
  "thermometer": Thermometer,
  "bath": Bath,
  "leaf": Leaf,
  "users": Users,
  "target": Target,
  "crosshair": Crosshair,
  "brain": Brain,
  "wind": Wind,
  "moon": Moon,
  "star": Star,
  "circle-dot": CircleDot,
  "sun": Sun,
  "mountain": Mountain,
  "trophy": Trophy,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

function DisciplineIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = name ? ICON_MAP[name] : null;
  if (!Icon) return <Dumbbell className={className} />;
  return <Icon className={className} />;
}

interface Props {
  data: ExtractedDiscipline[];
  onChange: (data: ExtractedDiscipline[]) => void;
}

export function DisciplinesCard({ data, onChange }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const update = (i: number, partial: Partial<ExtractedDiscipline>) =>
    onChange(data.map((d, j) => (j === i ? { ...d, ...partial } : d)));

  const remove = (i: number) => {
    onChange(data.filter((_, j) => j !== i));
    if (expanded === i) setExpanded(null);
  };

  const add = () => {
    onChange([
      ...data,
      {
        name: "",
        description: null,
        durationMinutes: 50,
        level: "all",
        tags: [],
        suggestedColor: null,
        suggestedIcon: "dumbbell",
        source: "website",
        confidence: "low",
      },
    ]);
    setExpanded(data.length);
  };

  return (
    <Card className="border border-gray-100">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Dumbbell className="h-4 w-4 text-indigo-500" />
            Disciplinas
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={add} className="gap-1 text-xs text-indigo-600">
            <Plus className="h-3.5 w-3.5" /> Añadir
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 && (
          <p className="text-sm text-gray-400">No se detectaron disciplinas</p>
        )}
        {data.map((disc, i) => (
          <div key={i} className="rounded-lg border border-gray-100 bg-gray-50/50">
            <div
              className="flex cursor-pointer items-center gap-2 p-3"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: disc.suggestedColor || "#e5e7eb" }}
              >
                <DisciplineIcon
                  name={disc.suggestedIcon}
                  className="h-3.5 w-3.5 text-white"
                />
              </span>
              <span className="flex-1 text-sm font-medium text-gray-900">
                {disc.name || "Nueva disciplina"}
              </span>
              <SourceBadge source={disc.source} />
              <ConfidenceBadge level={disc.confidence} />
              {expanded === i ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </div>

            {expanded === i && (
              <div className="space-y-3 border-t border-gray-100 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs text-gray-500">Nombre</Label>
                    <Input
                      value={disc.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-gray-500">Duración (min)</Label>
                    <Input
                      type="number"
                      value={disc.durationMinutes ?? ""}
                      onChange={(e) =>
                        update(i, {
                          durationMinutes: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <Label className="mb-1 block text-xs text-gray-500">Descripción</Label>
                  <Textarea
                    value={disc.description || ""}
                    onChange={(e) => update(i, { description: e.target.value || null })}
                    rows={2}
                    className="text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs text-gray-500">Nivel</Label>
                    <select
                      value={disc.level || "all"}
                      onChange={(e) =>
                        update(i, { level: e.target.value as ExtractedDiscipline["level"] })
                      }
                      className="h-8 w-full rounded-md border border-gray-200 bg-card px-2 text-sm"
                    >
                      <option value="all">Todos los niveles</option>
                      <option value="beginner">Principiante</option>
                      <option value="intermediate">Intermedio</option>
                      <option value="advanced">Avanzado</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-gray-500">Tags</Label>
                    <Input
                      value={disc.tags.join(", ")}
                      onChange={(e) =>
                        update(i, {
                          tags: e.target.value
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="yoga, wellness"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs text-gray-500">Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={disc.suggestedColor || "#6366f1"}
                        onChange={(e) => update(i, { suggestedColor: e.target.value })}
                        className="h-7 w-7 cursor-pointer rounded border-0"
                      />
                      <span className="font-mono text-xs text-gray-400">
                        {disc.suggestedColor || "—"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-gray-500">Icono</Label>
                    <div className="flex flex-wrap gap-1">
                      {ICON_OPTIONS.map((iconName) => {
                        const isSelected = disc.suggestedIcon === iconName;
                        const IconComp = ICON_MAP[iconName];
                        return (
                          <button
                            key={iconName}
                            type="button"
                            onClick={() => update(i, { suggestedIcon: iconName })}
                            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                              isSelected
                                ? "border-indigo-500 bg-indigo-50 text-indigo-600"
                                : "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                            title={iconName}
                          >
                            <IconComp className="h-3.5 w-3.5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => remove(i)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" /> Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
