"use client";

import { AppHeader } from "./app-header";
import {
  StepItem,
  IconBadge,
  ActionBadge,
  ShareIcon,
  PlusIcon,
  DotsIcon,
} from "./step-item";
import type { StudioBranding } from "@/lib/branding";

export function IosSafariNewScreen({ brand }: { brand: StudioBranding }) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      <div className="mb-4 w-full rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-0">
          <StepItem num={1} subtitle="Junto a la barra de dirección, arriba">
            <span>Toca</span>
            <IconBadge><DotsIcon size={16} /></IconBadge>
          </StepItem>

          <StepItem num={2}>
            <span>Toca</span>
            <ActionBadge icon={<ShareIcon size={12} />} label="Compartir" />
          </StepItem>

          <StepItem num={3}>
            <span>Toca</span>
            <ActionBadge icon={<PlusIcon size={12} />} label="Añadir a pantalla de inicio" />
          </StepItem>

          <StepItem num={4} subtitle="Si no está activado, actívalo">
            <span>Activa</span>
            <ActionBadge
              icon={<ToggleIcon />}
              label="Abrir como app web"
            />
          </StepItem>

          <StepItem num={5}>
            <span>Toca</span>
            <ActionBadge icon={<PlusIcon size={12} />} label="Añadir" />
          </StepItem>
        </div>
      </div>
    </div>
  );
}

function ToggleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <rect x="1" y="6" width="22" height="12" rx="6" fill="#34C759" />
      <circle cx="17" cy="12" r="4.5" fill="white" />
    </svg>
  );
}
