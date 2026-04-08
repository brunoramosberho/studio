"use client";

import { ExternalLink } from "lucide-react";
import { AppHeader } from "./app-header";
import {
  StepItem,
  IconBadge,
  ActionBadge,
  ShareIcon,
  PlusIcon,
  ChevronDownIcon,
} from "./step-item";
import type { StudioBranding } from "@/lib/branding";

export function IosChromeScreen({ brand }: { brand: StudioBranding }) {
  const openInSafari = () => {
    window.location.href = window.location.href;
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      {/* Safari recommendation */}
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

      {/* Chrome instructions */}
      <div className="w-full rounded-2xl bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-medium text-[#1C1917]">
          Continuar con Chrome:
        </p>
        <p className="mb-4 text-xs text-[#888]">
          También puedes instalarla desde aquí
        </p>

        <div className="space-y-0">
          <StepItem num={1}>
            <span>Pulsa</span>
            <IconBadge><ShareIcon size={16} /></IconBadge>
            <span>en la barra de URL</span>
          </StepItem>

          <StepItem num={2} subtitle="para ver todas las acciones disponibles">
            <span>Toca</span>
            <ActionBadge icon={<ChevronDownIcon size={12} />} label="Ver más" />
          </StepItem>

          <StepItem num={3}>
            <span>Selecciona</span>
            <ActionBadge icon={<PlusIcon size={12} />} label="Agregar a Inicio" />
          </StepItem>
        </div>
      </div>
    </div>
  );
}
