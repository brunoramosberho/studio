"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/onboarding/ColorPicker";
import type { ExtractedBrand } from "@/lib/onboarding/types";
import { Palette, Plus, X } from "lucide-react";

interface Props {
  data: ExtractedBrand;
  onChange: (data: ExtractedBrand) => void;
}

export function BrandCard({ data, onChange }: Props) {
  const set = <K extends keyof ExtractedBrand>(key: K, value: ExtractedBrand[K]) =>
    onChange({ ...data, [key]: value });

  const updateSecondary = (index: number, value: string | null) => {
    const updated = [...(data.secondaryColors || [])];
    if (value === null) {
      updated.splice(index, 1);
    } else {
      updated[index] = value;
    }
    set("secondaryColors", updated);
  };

  const addSecondary = () => {
    set("secondaryColors", [...(data.secondaryColors || []), "#888888"]);
  };

  return (
    <Card className="border border-gray-100">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4 text-indigo-500" />
          Marca
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-gray-500">Color principal</Label>
            <ColorPicker value={data.primaryColor} onChange={(v) => set("primaryColor", v)} />
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-gray-500">Color acento (app)</Label>
            <ColorPicker value={data.accentColor} onChange={(v) => set("accentColor", v)} />
          </div>
        </div>

        <div>
          <Label className="mb-1.5 block text-xs font-medium text-gray-500">Color fondo landing</Label>
          <ColorPicker value={data.landingBgColor} onChange={(v) => set("landingBgColor", v)} />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs font-medium text-gray-500">Colores secundarios</Label>
            {(data.secondaryColors?.length || 0) < 6 && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={addSecondary}>
                <Plus className="mr-1 h-3 w-3" />
                Añadir
              </Button>
            )}
          </div>
          {data.secondaryColors && data.secondaryColors.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.secondaryColors.map((color, i) => (
                <div key={i} className="flex items-center gap-1 rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => updateSecondary(i, e.target.value)}
                    className="h-6 w-6 cursor-pointer rounded border-0"
                  />
                  <span className="font-mono text-xs text-gray-600">{color}</span>
                  <button
                    onClick={() => updateSecondary(i, null)}
                    className="ml-1 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Sin colores secundarios detectados</p>
          )}
        </div>

        <div>
          <Label className="mb-1.5 block text-xs font-medium text-gray-500">Logo URL</Label>
          <div className="flex items-center gap-3">
            {data.logoUrl && (
              <img
                src={data.logoUrl}
                alt="Logo"
                className="h-10 w-10 rounded-lg border border-gray-200 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <Input
              value={data.logoUrl || ""}
              onChange={(e) => set("logoUrl", e.target.value || null)}
              placeholder="https://..."
              className="flex-1"
            />
          </div>
        </div>

        <div>
          <Label className="mb-1.5 block text-xs font-medium text-gray-500">Moneda</Label>
          <Input
            value={data.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
            placeholder="EUR"
            className="w-24 font-mono"
            maxLength={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
