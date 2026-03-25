import type { Tenant } from "@prisma/client";

export interface StudioBranding {
  studioName: string;
  tagline: string;
  slogan: string;
  metaDescription: string;
  logoUrl: string | null;
  appIconUrl: string | null;
  fontPairing: string;
  colorBg: string;
  colorFg: string;
  colorSurface: string;
  colorAccent: string;
  colorAccentSoft: string;
  colorMuted: string;
  colorBorder: string;
  colorCoach: string;
  colorAdmin: string;
  coachIconSvg: string | null;
}

export const DEFAULTS: StudioBranding = {
  studioName: "Reserva",
  tagline: "Pilates & Wellness",
  slogan: "Muévete. Respira. Floréce.",
  metaDescription: "Tu espacio de Pilates y bienestar.",
  logoUrl: null,
  appIconUrl: null,
  fontPairing: "playfair-dmsans",
  colorBg: "#FAF9F6",
  colorFg: "#1C1917",
  colorSurface: "#F5F2ED",
  colorAccent: "#C9A96E",
  colorAccentSoft: "#E8D9BF",
  colorMuted: "#8C8279",
  colorBorder: "#E8E2D9",
  colorCoach: "#2D5016",
  colorAdmin: "#1A2C4E",
  coachIconSvg: null,
};

export interface FontPairing {
  id: string;
  label: string;
  displayFont: string;
  bodyFont: string;
  displayVar: string;
  bodyVar: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
  { id: "playfair-dmsans", label: "Playfair + DM Sans", displayFont: "Playfair Display", bodyFont: "DM Sans", displayVar: "var(--font-playfair), serif", bodyVar: "var(--font-dmsans), sans-serif" },
  { id: "cormorant-lato", label: "Cormorant + Lato", displayFont: "Cormorant Garamond", bodyFont: "Lato", displayVar: "var(--font-cormorant), serif", bodyVar: "var(--font-lato), sans-serif" },
  { id: "libre-source", label: "Libre Baskerville + Source Sans", displayFont: "Libre Baskerville", bodyFont: "Source Sans 3", displayVar: "var(--font-libre), serif", bodyVar: "var(--font-source), sans-serif" },
  { id: "josefin-work", label: "Josefin Sans + Work Sans", displayFont: "Josefin Sans", bodyFont: "Work Sans", displayVar: "var(--font-josefin), sans-serif", bodyVar: "var(--font-work), sans-serif" },
  { id: "crimson-inter", label: "Crimson Text + Inter", displayFont: "Crimson Text", bodyFont: "Inter", displayVar: "var(--font-crimson), serif", bodyVar: "var(--font-inter), sans-serif" },
  { id: "raleway-opensans", label: "Raleway + Open Sans", displayFont: "Raleway", bodyFont: "Open Sans", displayVar: "var(--font-raleway), sans-serif", bodyVar: "var(--font-opensans), sans-serif" },
  { id: "lora-nunito", label: "Lora + Nunito", displayFont: "Lora", bodyFont: "Nunito", displayVar: "var(--font-lora), serif", bodyVar: "var(--font-nunito), sans-serif" },
  { id: "montserrat-roboto", label: "Montserrat + Roboto", displayFont: "Montserrat", bodyFont: "Roboto", displayVar: "var(--font-montserrat), sans-serif", bodyVar: "var(--font-roboto), sans-serif" },
];

export function getFontPairing(id: string): FontPairing {
  return FONT_PAIRINGS.find((p) => p.id === id) ?? FONT_PAIRINGS[0];
}

export function tenantToBranding(tenant: Tenant): StudioBranding {
  return {
    studioName: tenant.name,
    tagline: tenant.tagline,
    slogan: tenant.slogan,
    metaDescription: tenant.metaDescription,
    logoUrl: tenant.logoUrl,
    appIconUrl: tenant.appIconUrl,
    fontPairing: tenant.fontPairing,
    colorBg: tenant.colorBg,
    colorFg: tenant.colorFg,
    colorSurface: tenant.colorSurface,
    colorAccent: tenant.colorAccent,
    colorAccentSoft: tenant.colorAccentSoft,
    colorMuted: tenant.colorMuted,
    colorBorder: tenant.colorBorder,
    colorCoach: tenant.colorCoach,
    colorAdmin: tenant.colorAdmin,
    coachIconSvg: tenant.coachIconSvg,
  };
}

