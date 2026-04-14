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
  // Only apply tenant-customizable vars as inline style. Platform neutrals
  // (bg/fg/surface/muted/border/card) are driven by globals.css so the
  // `html.dark` class can override them cleanly.
  // `--color-accent-soft` / `--color-accent-border` / `--color-accent-text`
  // are derived at CSS level via color-mix() against the current background.
  html.style.setProperty("--color-accent", b.colorAccent);
  html.style.setProperty("--color-hero-bg", b.colorHeroBg);
  html.style.setProperty("--color-ring", b.colorAccent);
  // Role colors track the tenant's choice in both themes (many tenants
  // align admin/coach with their brand accent — e.g. orange for BE TORO).
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
        const merged = { ...DEFAULTS, ...data };
        setBranding(merged);
        applyTheme(merged);
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
