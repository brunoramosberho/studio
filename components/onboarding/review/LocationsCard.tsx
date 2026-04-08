"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/onboarding/ConfidenceBadge";
import type { ExtractedLocation } from "@/lib/onboarding/types";
import { MapPin, Plus, Trash2 } from "lucide-react";

interface Props {
  data: ExtractedLocation[];
  onChange: (data: ExtractedLocation[]) => void;
}

export function LocationsCard({ data, onChange }: Props) {
  const update = (i: number, partial: Partial<ExtractedLocation>) =>
    onChange(data.map((loc, j) => (j === i ? { ...loc, ...partial } : loc)));

  const remove = (i: number) => onChange(data.filter((_, j) => j !== i));

  const add = () =>
    onChange([...data, { name: "", city: null, address: null, confidence: "low" }]);

  return (
    <Card className="border border-gray-100">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-indigo-500" />
            Estudios
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={add} className="gap-1 text-xs text-indigo-600">
            <Plus className="h-3.5 w-3.5" /> Añadir
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.length === 0 && (
          <p className="text-sm text-gray-400">No se detectaron estudios</p>
        )}
        {data.map((loc, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={loc.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Nombre del estudio"
                  className="h-8 text-sm font-medium"
                />
                <ConfidenceBadge level={loc.confidence} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={loc.city || ""}
                  onChange={(e) => update(i, { city: e.target.value || null })}
                  placeholder="Ciudad"
                  className="h-8 text-sm"
                />
                <Input
                  value={loc.address || ""}
                  onChange={(e) => update(i, { address: e.target.value || null })}
                  placeholder="Dirección"
                  className="h-8 text-sm"
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
        <p className="text-xs text-gray-400">Las salas se configuran después del onboarding</p>
      </CardContent>
    </Card>
  );
}
