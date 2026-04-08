"use client";

import { AppHeader } from "./app-header";
import {
  StepItem,
  IconBadge,
  ActionBadge,
  ShareIcon,
  PlusIcon,
  DotsIcon,
  ChevronDownIcon,
  ChevronRight,
} from "./step-item";
import { SafariBarIllustration } from "./illustrations";
import type { StudioBranding } from "@/lib/branding";

/**
 * iOS 18+ changed Safari's bottom bar: ← tab URL reload ···
 * Share is now behind the ··· menu, no longer a direct ↑ button.
 * iOS 15-17 had ← → ↑ bookmark tabs in the bottom toolbar.
 */
export function IosSafariScreen({
  brand,
  iosVersion,
}: {
  brand: StudioBranding;
  iosVersion: number | null;
}) {
  const color = brand.colorAccent;
  const useDotsFlow = iosVersion !== null && iosVersion >= 18;

  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      <div className="mb-4 w-full rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-0">
          {useDotsFlow ? (
            /* ── iOS 18+: ··· → Compartir → Añadir ── */
            <>
              <StepItem num={1} subtitle="En la barra inferior de Safari">
                <span>Pulsa</span>
                <IconBadge><DotsIcon size={16} /></IconBadge>
              </StepItem>

              <StepItem num={2}>
                <span>Toca</span>
                <ActionBadge icon={<ShareIcon size={12} />} label="Compartir" />
                <ChevronRight />
                <ActionBadge icon={<ChevronDownIcon size={12} />} label="Ver más" />
              </StepItem>

              <StepItem num={3}>
                <span>Selecciona</span>
                <ActionBadge icon={<PlusIcon size={12} />} label="Añadir a pantalla de inicio" />
              </StepItem>

              <StepItem num={4}>
                <span>Toca</span>
                <ActionBadge icon={<PlusIcon size={12} />} label="Añadir" />
                <span>para confirmar</span>
              </StepItem>
            </>
          ) : (
            /* ── iOS 15-17: ↑ → Ver más → Añadir ── */
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Visual reference */}
      <div className="w-full rounded-2xl bg-white p-4 shadow-sm">
        <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-wide text-[#888]">
          ¿Dónde está el botón?
        </p>
        <SafariBarIllustration accentColor={color} useDotsFlow={useDotsFlow} />
      </div>
    </div>
  );
}
