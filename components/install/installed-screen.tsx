"use client";

import { Check } from "lucide-react";
import { AppHeader } from "./app-header";
import type { StudioBranding } from "@/lib/branding";

export function InstalledScreen({ brand }: { brand: StudioBranding }) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      <div className="mb-6 flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2">
        <Check className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-700">
          App instalada
        </span>
      </div>

      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: brand.colorAccent }}
      >
        {brand.appIconUrl ? (
          <img
            src={brand.appIconUrl}
            alt={brand.studioName}
            className="h-10 w-10 object-contain"
          />
        ) : (
          <span className="text-lg font-bold text-white">
            {brand.studioName.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <p className="mb-8 text-center text-xs text-[#888]">
        Así se ve en tu pantalla de inicio
      </p>

      <button
        onClick={() => {
          window.location.href = "/";
        }}
        className="w-full rounded-2xl py-4 text-base font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: brand.colorAccent }}
      >
        Abrir la app
      </button>

      {brand.landingUrl && (
        <button
          onClick={() => window.open(brand.landingUrl!, "_blank")}
          className="mt-3 w-full rounded-2xl border border-black/10 bg-white py-3.5 text-sm font-medium text-[#1C1917] transition-colors hover:bg-black/[0.03]"
        >
          Ir al sitio web
        </button>
      )}
    </div>
  );
}
