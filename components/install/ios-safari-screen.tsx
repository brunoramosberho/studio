"use client";

import { AppHeader } from "./app-header";
import {
  StepItem,
  IconBadge,
  ActionBadge,
  ShareIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronRight,
} from "./step-item";
import { SafariShareLocations, ShareSheetMockup } from "./illustrations";
import type { StudioBranding } from "@/lib/branding";

export function IosSafariScreen({ brand }: { brand: StudioBranding }) {
  const color = brand.colorAccent;

  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      <div className="mb-4 w-full rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-0">
          <StepItem
            num={1}
            subtitle="Está en la barra inferior o junto a la URL arriba"
          >
            <span>Pulsa</span>
            <IconBadge><ShareIcon size={16} /></IconBadge>
            <span>en Safari</span>
          </StepItem>

          <StepItem num={2}>
            <span>Toca</span>
            <ActionBadge icon={<ChevronDownIcon size={12} />} label="Ver más" />
            <ChevronRight />
            <ActionBadge icon={<PlusIcon size={12} />} label="Añadir a pantalla de inicio" />
          </StepItem>

          <StepItem num={3}>
            <span>Toca</span>
            <ActionBadge icon={<PlusIcon size={12} />} label="Añadir" />
            <span>para confirmar</span>
          </StepItem>
        </div>
      </div>

      {/* Visual reference: where to find the share button */}
      <div className="mb-4 w-full rounded-2xl bg-white p-4 shadow-sm">
        <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-wide text-[#888]">
          ¿Dónde está el botón?
        </p>
        <SafariShareLocations accentColor={color} />
      </div>

      <div className="w-full">
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3">
          <span className="text-lg">💡</span>
          <p className="text-xs text-amber-800">
            Asegúrate de estar usando <strong>Safari</strong> para poder instalar la app.
          </p>
        </div>
      </div>
    </div>
  );
}
