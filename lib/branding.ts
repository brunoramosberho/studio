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
  colorHeroBg: string;
  colorCoach: string;
  colorAdmin: string;
  coachIconSvg: string | null;
  landingUrl: string | null;
  communityHeadline: string;
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
  colorFg: "#18181B",
  colorSurface: "#FAFAFA",
  colorAccent: "#FF5A2C",
  colorAccentSoft: "#FFF1EE",
  colorMuted: "#71717A",
  colorBorder: "#E4E4E7",
  colorHeroBg: "#18181B",
  colorCoach: "#15803D",
  colorAdmin: "#1E40AF",
  coachIconSvg: null,
  landingUrl: null,
  communityHeadline: "Tu comunidad en movimiento",
};

export interface FontPairing {
  id: string;
  label: string;
  description: string;
  displayFont: string;
  bodyFont: string;
  displayVar: string;
  bodyVar: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
  { id: "jakarta-dmsans", label: "Plus Jakarta Sans + DM Sans", description: "Premium y elegante — ideal para estudios de alta gama", displayFont: "Plus Jakarta Sans", bodyFont: "DM Sans", displayVar: "var(--font-jakarta), sans-serif", bodyVar: "var(--font-dmsans), sans-serif" },
  { id: "geist-inter", label: "Geist + Inter", description: "Tech y moderna — para identidad minimalista", displayFont: "Geist", bodyFont: "Inter", displayVar: "var(--font-geist-sans), sans-serif", bodyVar: "var(--font-inter), sans-serif" },
  { id: "outfit-nunito", label: "Outfit + Nunito Sans", description: "Amigable y cálida — para estudios casual o familiar", displayFont: "Outfit", bodyFont: "Nunito Sans", displayVar: "var(--font-outfit), sans-serif", bodyVar: "var(--font-nunitosans), sans-serif" },
  { id: "montserrat-roboto", label: "Montserrat + Roboto", description: "Clásica y versátil — funciona para cualquier estudio", displayFont: "Montserrat", bodyFont: "Roboto", displayVar: "var(--font-montserrat), sans-serif", bodyVar: "var(--font-roboto), sans-serif" },
  { id: "inter-inter", label: "Inter", description: "Limpia y universal — la opción más neutra", displayFont: "Inter", bodyFont: "Inter", displayVar: "var(--font-inter), sans-serif", bodyVar: "var(--font-inter), sans-serif" },
  { id: "raleway-opensans", label: "Raleway + Open Sans", description: "Suave y relajada — ideal para yoga o pilates", displayFont: "Raleway", bodyFont: "Open Sans", displayVar: "var(--font-raleway), sans-serif", bodyVar: "var(--font-opensans), sans-serif" },
];

export function getFontPairing(id: string): FontPairing {
  return FONT_PAIRINGS.find((p) => p.id === id) ?? FONT_PAIRINGS[0];
}

/* ── Platform-level fixed colors (not customizable by tenant admins) ── */

/* Platform-level fixed neutrals. admin/coach are intentionally left out —
   tenants can set them to match their brand accent (e.g. orange for
   BE TORO) and we honor that value in both light and dark. */
export const PLATFORM_COLORS = {
  colorBg: "#FFFFFF",
  colorFg: "#18181B",
  colorSurface: "#FAFAFA",
  colorMuted: "#71717A",
  colorBorder: "#E4E4E7",
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length !== 6) return [0, 0, 0];
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) =>
        Math.round(Math.min(255, Math.max(0, c)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** Generate a soft/light tint of the given accent color */
export function deriveAccentSoft(accent: string): string {
  const [r, g, b] = hexToRgb(accent);
  const mix = 0.82;
  return rgbToHex(
    r + (255 - r) * mix,
    g + (255 - g) * mix,
    b + (255 - b) * mix,
  );
}

/**
 * Apply platform defaults + derived colors on top of client-chosen values.
 * Only colorAccent and colorHeroBg are preserved from the input;
 * everything else is fixed or derived.
 */
export function withDerivedColors(branding: StudioBranding): StudioBranding {
  return {
    ...branding,
    ...PLATFORM_COLORS,
    colorAccentSoft: deriveAccentSoft(branding.colorAccent),
  };
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
    colorHeroBg: tenant.colorHeroBg,
    colorCoach: tenant.colorCoach,
    colorAdmin: tenant.colorAdmin,
    coachIconSvg: tenant.coachIconSvg,
    landingUrl: tenant.landingUrl,
    communityHeadline: tenant.communityHeadline,
  };
}

