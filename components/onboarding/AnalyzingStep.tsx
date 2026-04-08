"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  websiteUrl: string;
  hasBrandbook: boolean;
  hasInstagram: boolean;
  error: string | null;
  onRetry: () => void;
}

const BASE_STEPS = [
  "Leyendo el sitio web...",
  "Buscando página de precios...",
  "Extrayendo colores y marca...",
];

export function AnalyzingStep({ websiteUrl, hasBrandbook, hasInstagram, error, onRetry }: Props) {
  const allSteps = [
    ...BASE_STEPS,
    ...(hasBrandbook ? ["Analizando brandbook..."] : []),
    ...(hasInstagram ? ["Analizando Instagram..."] : []),
    "Detectando disciplinas...",
    "Procesando paquetes y precios...",
    "Generando configuración...",
  ];

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev < allSteps.length - 1 ? prev + 1 : prev));
    }, 2200);
    return () => clearInterval(interval);
  }, [allSteps.length, error]);

  if (error) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-8">
          <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">Error en el análisis</h3>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <Button onClick={onRetry} className="mt-6 bg-indigo-600 hover:bg-indigo-700">
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md text-center">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 p-8">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-indigo-500" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          Analizando {websiteUrl}
        </h3>
        <p className="mt-1 text-sm text-gray-500">Esto puede tardar 10-30 segundos</p>

        <div className="mt-6 space-y-2 text-left">
          {allSteps.map((step, i) => (
            <div
              key={step}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-all duration-300 ${
                i < activeIndex
                  ? "text-green-700"
                  : i === activeIndex
                    ? "font-medium text-indigo-700"
                    : "text-gray-400"
              }`}
            >
              {i < activeIndex ? (
                <Check className="h-4 w-4 shrink-0 text-green-500" />
              ) : i === activeIndex ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-500" />
              ) : (
                <div className="h-4 w-4 shrink-0" />
              )}
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
