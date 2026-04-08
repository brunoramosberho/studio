"use client";

import { QRCodeSVG } from "qrcode.react";
import { Smartphone } from "lucide-react";
import { AppHeader } from "./app-header";
import type { StudioBranding } from "@/lib/branding";

export function OtherScreen({ brand }: { brand: StudioBranding }) {
  const installUrl =
    typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="flex w-full max-w-sm flex-col items-center px-6">
      <AppHeader brand={brand} />

      <div className="w-full rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-[#888]" />
          <p className="text-sm font-medium text-[#1C1917]">
            Esta app está optimizada para móvil
          </p>
        </div>

        {installUrl && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-2xl border border-black/[0.06] bg-white p-4">
              <QRCodeSVG
                value={installUrl}
                size={180}
                bgColor="transparent"
                fgColor="#1C1917"
                level="M"
              />
            </div>
            <p className="text-center text-xs text-[#888]">
              Escanea este código desde tu iPhone o Android
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
