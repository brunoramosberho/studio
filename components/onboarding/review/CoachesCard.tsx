"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/onboarding/ConfidenceBadge";
import type { ExtractedCoach } from "@/lib/onboarding/types";
import { UserCog, Plus, Trash2, X } from "lucide-react";

interface Props {
  data: ExtractedCoach[];
  onChange: (data: ExtractedCoach[]) => void;
}

export function CoachesCard({ data, onChange }: Props) {
  const update = (i: number, partial: Partial<ExtractedCoach>) =>
    onChange(data.map((c, j) => (j === i ? { ...c, ...partial } : c)));

  const remove = (i: number) => onChange(data.filter((_, j) => j !== i));

  const add = () =>
    onChange([
      ...data,
      { name: "", photoUrl: null, specialties: [], source: "website", confidence: "low" },
    ]);

  const addSpecialty = (i: number, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const coach = data[i];
    if (coach.specialties.includes(trimmed)) return;
    update(i, { specialties: [...coach.specialties, trimmed] });
  };

  const removeSpecialty = (i: number, sp: string) => {
    update(i, { specialties: data[i].specialties.filter((s) => s !== sp) });
  };

  return (
    <Card className="border border-gray-100">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4 text-amber-600" />
            Coaches
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={add} className="gap-1 text-xs text-amber-600">
            <Plus className="h-3.5 w-3.5" /> Añadir
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.length === 0 && (
          <p className="text-sm text-gray-400">No se detectaron coaches en el contenido</p>
        )}
        {data.map((coach, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
            {coach.photoUrl && (
              <img
                src={coach.photoUrl}
                alt={coach.name}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={coach.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Nombre del coach"
                  className="h-8 text-sm font-medium"
                />
                <ConfidenceBadge level={coach.confidence} />
              </div>
              <Input
                value={coach.photoUrl || ""}
                onChange={(e) => update(i, { photoUrl: e.target.value || null })}
                placeholder="URL de foto (opcional)"
                className="h-8 text-xs text-gray-500"
              />
              <div>
                <div className="mb-1 flex flex-wrap gap-1">
                  {coach.specialties.map((sp) => (
                    <Badge key={sp} variant="secondary" className="gap-1 pr-1 text-[10px]">
                      {sp}
                      <button onClick={() => removeSpecialty(i, sp)} className="hover:text-red-500">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  placeholder="Agregar especialidad + Enter"
                  className="h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSpecialty(i, (e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
            </div>
            <button
              onClick={() => remove(i)}
              className="mt-1 shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <p className="text-xs text-gray-400">Los coaches se crean sin cuenta de usuario. Se pueden vincular después.</p>
      </CardContent>
    </Card>
  );
}
