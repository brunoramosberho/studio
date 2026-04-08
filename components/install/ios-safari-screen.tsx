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
 * iOS 18+ Safari has two possible layouts depending on the user's
 * "Address Bar Position" setting (Settings > Safari):
 *
 * - Tab Bar (bottom, default): compact bar with ··· → share is behind menu
 * - Single Tab (top): classic toolbar at bottom with ↑ directly visible
 *
 * We can't detect this from JS, so we show both options.
 * iOS 15-17 always shows ↑ in the bottom toolbar.
 */
export function IosSafariScreen({
  brand,
  iosVersion,
}: {
  brand: StudioBranding;
  iosVersion: number | null;
}) {
  const color = brand.colorAccent;
  const isIOS18Plus = iosVersion !== null && iosVersion >= 18;

  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      <div className="mb-4 w-full rounded-2xl bg-white p-5 shadow-sm">
        <div className="space-y-0">
          {isIOS18Plus ? (
            <>
              <StepItem num={1} subtitle="En la barra inferior de Safari">
                <span>Pulsa</span>
                <IconBadge><DotsIcon size={16} /></IconBadge>
                <span>o</span>
                <IconBadge><ShareIcon size={16} /></IconBadge>
              </StepItem>

              <StepItem num={2} subtitle="Si pulsaste ···, primero toca Compartir">
                <span>Toca</span>
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
            <>
              <StepItem num={1} subtitle="En la barra inferior de Safari">
                <span>Pulsa</span>
                <IconBadge><ShareIcon size={16} /></IconBadge>
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
        <SafariBarIllustration accentColor={color} />
      </div>
    </div>
  );
}
