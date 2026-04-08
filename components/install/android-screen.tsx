"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { AppHeader } from "./app-header";
import { StepItem, IconBadge, ActionBadge, PlusIcon } from "./step-item";
import type { StudioBranding } from "@/lib/branding";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function AndroidScreen({
  brand,
  deferredPrompt,
}: {
  brand: StudioBranding;
  deferredPrompt: BeforeInstallPromptEvent | null;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      {deferredPrompt ? (
        <AndroidInstallButton deferredPrompt={deferredPrompt} brand={brand} />
      ) : (
        <div className="w-full rounded-2xl bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-medium text-[#1C1917]">
            Instálala en 2 pasos:
          </p>

          <div className="space-y-0">
            <StepItem num={1} subtitle="El menú de tres puntos">
              <span>Toca</span>
              <IconBadge><VerticalDotsIcon /></IconBadge>
              <span>arriba a la derecha</span>
            </StepItem>
            <StepItem num={2}>
              <span>Toca</span>
              <ActionBadge icon={<PlusIcon size={12} />} label="Añadir a pantalla de inicio" />
            </StepItem>
          </div>
        </div>
      )}
    </div>
  );
}

function AndroidInstallButton({
  deferredPrompt,
  brand,
}: {
  deferredPrompt: BeforeInstallPromptEvent;
  brand: StudioBranding;
}) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstalling(false);
  };

  if (installed) {
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-4">
        <Check className="h-5 w-5 text-emerald-600" />
        <p className="text-base font-medium text-emerald-700">
          ¡App instalada!
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={handleInstall}
      disabled={installing}
      className="w-full rounded-2xl py-4 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      style={{ background: brand.colorAccent }}
    >
      {installing ? "Instalando..." : `Instalar ${brand.studioName}`}
    </button>
  );
}

function VerticalDotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="12" cy="19" r="2.5" />
    </svg>
  );
}
