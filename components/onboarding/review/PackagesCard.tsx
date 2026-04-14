"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfidenceBadge } from "@/components/onboarding/ConfidenceBadge";
import { Badge } from "@/components/ui/badge";
import type { ExtractedPackage } from "@/lib/onboarding/types";
import { CreditCard, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  data: ExtractedPackage[];
  currency: string;
  onChange: (data: ExtractedPackage[]) => void;
}

const TYPE_LABELS: Record<ExtractedPackage["type"], { label: string; variant: "default" | "success" | "warning" }> = {
  offer: { label: "Oferta", variant: "warning" },
  package: { label: "Paquete", variant: "default" },
  subscription: { label: "Suscripción", variant: "success" },
};

export function PackagesCard({ data, currency, onChange }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const update = (i: number, partial: Partial<ExtractedPackage>) =>
    onChange(data.map((p, j) => (j === i ? { ...p, ...partial } : p)));

  const remove = (i: number) => {
    onChange(data.filter((_, j) => j !== i));
    if (expanded === i) setExpanded(null);
  };

  const add = () => {
    onChange([
      ...data,
      {
        name: "",
        type: "package",
        description: null,
        price: null,
        credits: null,
        unlimited: false,
        validityDays: 30,
        periodicity: null,
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
            <CreditCard className="h-4 w-4 text-indigo-500" />
            Paquetes y Suscripciones
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={add} className="gap-1 text-xs text-indigo-600">
            <Plus className="h-3.5 w-3.5" /> Añadir
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 && (
          <p className="text-sm text-gray-400">No se detectaron paquetes ni precios</p>
        )}
        {data.map((pkg, i) => {
          const typeMeta = TYPE_LABELS[pkg.type];
          return (
            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50/50">
              <div
                className="flex cursor-pointer items-center gap-2 p-3"
                onClick={() => setExpanded(expanded === i ? null : i)}
              >
                <Badge variant={typeMeta.variant} className="text-[10px]">
                  {typeMeta.label}
                </Badge>
                <span className="flex-1 text-sm font-medium text-gray-900">
                  {pkg.name || "Nuevo paquete"}
                </span>
                {pkg.price != null && (
                  <span className="text-sm font-semibold text-gray-700">
                    {pkg.price} {currency}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {pkg.unlimited ? "∞" : pkg.credits ?? "?"} créditos
                </span>
                <ConfidenceBadge level={pkg.confidence} />
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
                        value={pkg.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs text-gray-500">Tipo</Label>
                      <select
                        value={pkg.type}
                        onChange={(e) =>
                          update(i, {
                            type: e.target.value as ExtractedPackage["type"],
                            periodicity:
                              e.target.value === "subscription" ? pkg.periodicity || "monthly" : null,
                          })
                        }
                        className="h-8 w-full rounded-md border border-gray-200 bg-card px-2 text-sm"
                      >
                        <option value="offer">Oferta</option>
                        <option value="package">Paquete</option>
                        <option value="subscription">Suscripción</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="mb-1 block text-xs text-gray-500">Precio ({currency})</Label>
                      <Input
                        type="number"
                        value={pkg.price ?? ""}
                        onChange={(e) =>
                          update(i, { price: e.target.value ? Number(e.target.value) : null })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs text-gray-500">Créditos</Label>
                      <Input
                        type="number"
                        value={pkg.unlimited ? "" : (pkg.credits ?? "")}
                        onChange={(e) =>
                          update(i, {
                            credits: e.target.value ? Number(e.target.value) : null,
                            unlimited: false,
                          })
                        }
                        disabled={pkg.unlimited}
                        placeholder={pkg.unlimited ? "∞" : ""}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs text-gray-500">Días validez</Label>
                      <Input
                        type="number"
                        value={pkg.validityDays ?? ""}
                        onChange={(e) =>
                          update(i, {
                            validityDays: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={pkg.unlimited}
                        onChange={(e) =>
                          update(i, {
                            unlimited: e.target.checked,
                            credits: e.target.checked ? null : pkg.credits,
                          })
                        }
                        className="rounded"
                      />
                      Ilimitado
                    </label>
                    {pkg.type === "subscription" && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-gray-500">Periodicidad</Label>
                        <select
                          value={pkg.periodicity || "monthly"}
                          onChange={(e) =>
                            update(i, {
                              periodicity: e.target.value as "monthly" | "annual",
                            })
                          }
                          className="h-7 rounded border border-gray-200 bg-card px-2 text-xs"
                        >
                          <option value="monthly">Mensual</option>
                          <option value="annual">Anual</option>
                        </select>
                      </div>
                    )}
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
          );
        })}
      </CardContent>
    </Card>
  );
}
