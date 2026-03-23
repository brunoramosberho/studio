"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type StudioBranding, DEFAULTS, getFontPairing } from "@/lib/branding";

interface BrandingContextValue extends StudioBranding {
  refresh: () => void;
  update: (b: StudioBranding) => void;
}

const BrandingContext = createContext<BrandingContextValue>({
  ...DEFAULTS,
  refresh: () => {},
  update: () => {},
});

export function useBranding() {
  return useContext(BrandingContext);
}

export function applyTheme(b: StudioBranding) {
  const html = document.documentElement;
  html.style.setProperty("--color-background", b.colorBg);
  html.style.setProperty("--color-foreground", b.colorFg);
  html.style.setProperty("--color-surface", b.colorSurface);
  html.style.setProperty("--color-accent", b.colorAccent);
  html.style.setProperty("--color-accent-soft", b.colorAccentSoft);
  html.style.setProperty("--color-muted", b.colorMuted);
  html.style.setProperty("--color-border", b.colorBorder);
  html.style.setProperty("--color-ring", b.colorAccent);
  html.style.setProperty("--color-coach", b.colorCoach);
  html.style.setProperty("--color-admin", b.colorAdmin);

  const fp = getFontPairing(b.fontPairing);
  html.style.setProperty("--font-display", fp.displayVar);
  html.style.setProperty("--font-body", fp.bodyVar);
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<StudioBranding>(DEFAULTS);

  const fetchBranding = useCallback(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data: StudioBranding) => {
        setBranding(data);
        applyTheme(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  const updateBranding = useCallback((b: StudioBranding) => {
    setBranding(b);
    applyTheme(b);
  }, []);

  const value: BrandingContextValue = {
    ...branding,
    refresh: fetchBranding,
    update: updateBranding,
  };

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}
