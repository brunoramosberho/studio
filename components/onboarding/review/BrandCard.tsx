"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/onboarding/ColorPicker";
import type { ExtractedBrand } from "@/lib/onboarding/types";
import { Palette } from "lucide-react";

interface Props {
  data: ExtractedBrand;
  onChange: (data: ExtractedBrand) => void;
}

export function BrandCard({ data, onChange }: Props) {
  const set = <K extends keyof ExtractedBrand>(key: K, value: ExtractedBrand[K]) =>
    onChange({ ...data, [key]: value });

  return (
    <Card className="border border-gray-100">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4 text-indigo-500" />
          Marca
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-gray-500">Color principal</Label>
          <ColorPicker value={data.primaryColor} onChange={(v) => set("primaryColor", v)} />
        </div>

        <div>
          <Label className="mb-1.5 block text-xs font-medium text-gray-500">Color fondo landing</Label>
          <ColorPicker value={data.landingBgColor} onChange={(v) => set("landingBgColor", v)} />
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
