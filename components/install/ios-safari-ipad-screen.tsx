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

export function IosSafariIPadScreen({ brand }: { brand: StudioBranding }) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      <div className="mb-4 w-full rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-0">
          <StepItem
            num={1}
            subtitle="Busca en la barra superior de Safari"
          >
            <span>Pulsa</span>
            <IconBadge><ShareIcon size={16} /></IconBadge>
            <span>o</span>
            <IconBadge><DotsIcon size={16} /></IconBadge>
          </StepItem>

          <StepItem num={2} subtitle="Si pulsaste ···, primero toca Compartir">
            <span>Toca</span>
            <ActionBadge icon={<PlusIcon size={12} />} label="Añadir a pantalla de inicio" />
          </StepItem>

          <StepItem num={3}>
            <span>Toca</span>
            <ActionBadge icon={<PlusIcon size={12} />} label="Añadir" />
            <span>para confirmar</span>
          </StepItem>
        </div>
      </div>

      <div className="w-full">
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3">
          <span className="text-lg">💡</span>
          <p className="text-xs text-amber-800">
            En iPad, el botón puede estar en la barra superior. Si no ves{" "}
            <strong className="inline-flex align-middle"><ShareIcon size={12} /></strong>,
            busca <strong className="inline-flex align-middle"><DotsIcon size={12} /></strong> y
            luego <strong>Compartir</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
