"use client";

import { AppHeader } from "./app-header";
import { StepItem } from "./step-item";
import { SafariShareIcon } from "./safari-share-icon";
import type { StudioBranding } from "@/lib/branding";

export function IosSafariScreen({ brand }: { brand: StudioBranding }) {
  const color = brand.colorAccent;

  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      <div className="mb-4 w-full rounded-2xl bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm font-medium text-[#1C1917]">
          Instálala en 3 pasos:
        </p>

        <div className="space-y-0">
          <StepItem
            num={1}
            color={color}
            title={`Toca <strong><span class="inline-flex align-middle">${shareIconHtml()}</span></strong> en la barra inferior`}
            subtitle="El botón de compartir de Safari"
          />
          <StepItem
            num={2}
            color={color}
            title='Desplázate y toca <strong>"Añadir a pantalla de inicio"</strong>'
            subtitle="Puede que tengas que deslizar en el menú"
          />
          <StepItem
            num={3}
            color={color}
            title='Toca <strong>"Añadir"</strong> para confirmar'
            subtitle="La app aparecerá en tu pantalla de inicio"
          />
        </div>
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

function shareIconHtml() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
}
