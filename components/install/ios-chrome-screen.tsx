"use client";

import { ExternalLink } from "lucide-react";
import { AppHeader } from "./app-header";
import { StepItem } from "./step-item";
import type { StudioBranding } from "@/lib/branding";

export function IosChromeScreen({ brand }: { brand: StudioBranding }) {
  const color = brand.colorAccent;

  const openInSafari = () => {
    window.location.href = window.location.href;
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      {/* Safari recommendation banner */}
      <div className="mb-4 w-full rounded-2xl bg-blue-50 p-4">
        <p className="mb-3 text-sm font-medium text-blue-900">
          Para la mejor experiencia, abre esta página en Safari
        </p>
        <button
          onClick={openInSafari}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Abrir en Safari
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>

      {/* Chrome fallback instructions */}
      <div className="w-full rounded-2xl bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-medium text-[#1C1917]">
          Continuar con Chrome:
        </p>
        <p className="mb-4 text-xs text-[#888]">
          También puedes instalarla desde aquí
        </p>

        <div className="space-y-0">
          <StepItem
            num={1}
            color={color}
            title={`Toca <strong>${shareIconHtml()}</strong> en la barra de dirección`}
            subtitle="Arriba a la derecha"
          />
          <StepItem
            num={2}
            color={color}
            title='Toca <strong>"Ver más"</strong>'
            subtitle="Para ver todas las acciones disponibles"
          />
          <StepItem
            num={3}
            color={color}
            title='Selecciona <strong>"Agregar a Inicio"</strong>'
          />
        </div>
      </div>
    </div>
  );
}

function shareIconHtml() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
}
