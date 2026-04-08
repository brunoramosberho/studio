"use client";

import { AppHeader } from "./app-header";
import { StepItem } from "./step-item";
import type { StudioBranding } from "@/lib/branding";

export function IosSafariNewScreen({ brand }: { brand: StudioBranding }) {
  const color = brand.colorAccent;

  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      <div className="mb-4 w-full rounded-2xl bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm font-medium text-[#1C1917]">
          Instálala en 5 pasos:
        </p>

        <div className="space-y-0">
          <StepItem
            num={1}
            color={color}
            title='Toca <strong>···</strong> junto a la barra de dirección'
            subtitle="Arriba a la derecha"
          />
          <StepItem
            num={2}
            color={color}
            title='Toca <strong>"Compartir"</strong> en el menú'
          />
          <StepItem
            num={3}
            color={color}
            title='Toca <strong>"Añadir a pantalla de inicio"</strong>'
          />
          <StepItem
            num={4}
            color={color}
            title='Activa <strong>"Abrir como app web"</strong>'
            subtitle="Si no está activado, actívalo"
          />
          <StepItem
            num={5}
            color={color}
            title='Toca <strong>"Añadir"</strong>'
            subtitle="La app aparecerá en tu pantalla de inicio"
          />
        </div>
      </div>
    </div>
  );
}
