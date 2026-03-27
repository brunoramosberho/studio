/**
 * Branding del tenant al ejecutar `prisma db seed`.
 * Opcional: define SEED_* en `.env` para que un reset recupere tu marca.
 * Si no pones nada, se usan los valores por defecto (Flō / paleta actual).
 */
function envStr(key: string, fallback: string): string {
  const v = process.env[key]?.trim();
  return v && v.length > 0 ? v : fallback;
}

function envOpt(key: string): string | null {
  const v = process.env[key]?.trim();
  return v && v.length > 0 ? v : null;
}

export type TenantBrandingSeed = {
  slug: string;
  name: string;
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
};

export function getTenantBrandingFromEnv(): TenantBrandingSeed {
  return {
    slug: envStr("SEED_TENANT_SLUG", "betoro"),
    name: envStr("SEED_TENANT_NAME", "Flō"),
    tagline: envStr("SEED_TENANT_TAGLINE", "Pilates & Wellness"),
    slogan: envStr("SEED_TENANT_SLOGAN", "Muévete. Respira. Floréce."),
    metaDescription: envStr(
      "SEED_TENANT_META_DESCRIPTION",
      "Tu espacio de Pilates y bienestar.",
    ),
    logoUrl: envOpt("SEED_TENANT_LOGO_URL"),
    appIconUrl: envOpt("SEED_TENANT_APP_ICON_URL"),
    fontPairing: envStr("SEED_TENANT_FONT_PAIRING", "jakarta-dmsans"),
    colorBg: envStr("SEED_COLOR_BG", "#FAF9F6"),
    colorFg: envStr("SEED_COLOR_FG", "#1C1917"),
    colorSurface: envStr("SEED_COLOR_SURFACE", "#F5F2ED"),
    colorAccent: envStr("SEED_COLOR_ACCENT", "#C9A96E"),
    colorAccentSoft: envStr("SEED_COLOR_ACCENT_SOFT", "#E8D9BF"),
    colorMuted: envStr("SEED_COLOR_MUTED", "#8C8279"),
    colorBorder: envStr("SEED_COLOR_BORDER", "#E8E2D9"),
    colorCoach: envStr("SEED_COLOR_COACH", "#2D5016"),
    colorAdmin: envStr("SEED_COLOR_ADMIN", "#1A2C4E"),
  };
}

/** Campos para `prisma.tenant.create` / update (sin slug en updates parciales). */
export function tenantCreateData(b: TenantBrandingSeed) {
  return {
    slug: b.slug,
    name: b.name,
    tagline: b.tagline,
    slogan: b.slogan,
    metaDescription: b.metaDescription,
    logoUrl: b.logoUrl,
    appIconUrl: b.appIconUrl,
    fontPairing: b.fontPairing,
    colorBg: b.colorBg,
    colorFg: b.colorFg,
    colorSurface: b.colorSurface,
    colorAccent: b.colorAccent,
    colorAccentSoft: b.colorAccentSoft,
    colorMuted: b.colorMuted,
    colorBorder: b.colorBorder,
    colorCoach: b.colorCoach,
    colorAdmin: b.colorAdmin,
  };
}

export function studioSettingsData(b: TenantBrandingSeed) {
  return {
    studioName: b.name,
    tagline: b.tagline,
    slogan: b.slogan,
    metaDescription: b.metaDescription,
    logoUrl: b.logoUrl,
    appIconUrl: b.appIconUrl,
    fontPairing: b.fontPairing,
    colorBg: b.colorBg,
    colorFg: b.colorFg,
    colorSurface: b.colorSurface,
    colorAccent: b.colorAccent,
    colorAccentSoft: b.colorAccentSoft,
    colorMuted: b.colorMuted,
    colorBorder: b.colorBorder,
    colorCoach: b.colorCoach,
    colorAdmin: b.colorAdmin,
  };
}
