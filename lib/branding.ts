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
  tagline: "Booking & Management",
  slogan: "La plataforma para tu estudio.",
  metaDescription: "Gestiona reservas, clases y clientes en un solo lugar.",
  logoUrl: null,
  appIconUrl: null,
  fontPairing: "inter-inter",
  colorBg: "#FFFFFF",
  colorFg: "#0F172A",
  colorSurface: "#F8FAFC",
  colorAccent: "#6366F1",
  colorAccentSoft: "#E0E7FF",
  colorMuted: "#64748B",
  colorBorder: "#E2E8F0",
  colorCoach: "#059669",
  colorAdmin: "#4338CA",
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
  { id: "inter-inter", label: "Inter", displayFont: "Inter", bodyFont: "Inter", displayVar: "var(--font-inter), sans-serif", bodyVar: "var(--font-inter), sans-serif" },
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

