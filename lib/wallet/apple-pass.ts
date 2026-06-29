import "server-only";
import { PKPass } from "passkit-generator";
import sharp from "sharp";

/**
 * Apple Wallet membership pass generation.
 *
 * One Pass Type ID (under the Magic platform Apple Developer account) serves
 * every tenant — branding is baked into each generated pass (colours, logo,
 * studio name), not into the certificate. The signing material lives in env as
 * base64-encoded PEM so the raw key never sits in the repo:
 *   - APPLE_PASS_TYPE_ID            e.g. pass.com.mgic.membership
 *   - APPLE_TEAM_ID                 the 10-char Apple Team ID
 *   - APPLE_PASS_SIGNER_CERT_BASE64 base64 of the leaf Pass Type ID cert (PEM)
 *   - APPLE_PASS_SIGNER_KEY_BASE64  base64 of its private key (PEM, no passphrase)
 *   - APPLE_PASS_WWDR_BASE64        base64 of Apple's WWDR intermediate (PEM)
 *
 * The pass is a DISPLAY artifact only — the QR doubles as a check-in code, but
 * any benefit must be validated server-side against live membership at scan
 * time. Possessing the pass never grants access on its own.
 */

function loadCertificates() {
  const signerCert = process.env.APPLE_PASS_SIGNER_CERT_BASE64;
  const signerKey = process.env.APPLE_PASS_SIGNER_KEY_BASE64;
  const wwdr = process.env.APPLE_PASS_WWDR_BASE64;
  if (!signerCert || !signerKey || !wwdr) return null;
  return {
    signerCert: Buffer.from(signerCert, "base64").toString("utf8"),
    signerKey: Buffer.from(signerKey, "base64").toString("utf8"),
    wwdr: Buffer.from(wwdr, "base64").toString("utf8"),
  };
}

export { isApplePassConfigured } from "./config";

/* ── Colour helpers (PassKit wants `rgb(r, g, b)` strings) ── */

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return [0, 0, 0];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Perceived luminance, 0..255. */
function luminance([r, g, b]: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Linear blend from a toward b by t (0..1). */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Pick card colours. Default to the tenant's brand accent so the card is on
 * brand, but fall back to a dark card when the accent is too light for white
 * text. Foreground is always white; labels a dimmed white.
 */
/** Warm gold (Iberia-style) for warm brands; a light tint for cool ones. */
function deriveGoldLabel(accent: Rgb): Rgb {
  const warm = accent[0] >= accent[2];
  const target: Rgb = warm ? [255, 224, 150] : [255, 255, 255];
  return mix(accent, target, warm ? 0.6 : 0.55);
}

function pickCardColors(accentHex: string, heroHex: string, accentSoftHex: string) {
  const accent = hexToRgb(accentHex);
  let bg = accent;
  if (luminance(accent) > 165) {
    const hero = hexToRgb(heroHex);
    bg = luminance(hero) < 140 ? hero : mix(accent, [0, 0, 0], 0.6);
  }
  const fg: Rgb = [255, 255, 255];
  // Labels pop like Iberia's gold-on-red. Use the tenant's accentSoft only if
  // it's a usable mid-tone (not near-white); otherwise derive a warm gold from
  // the accent. Then guarantee it reads clearly above the card colour.
  const soft = hexToRgb(accentSoftHex);
  const softUsable = luminance(soft) < 232 && luminance(soft) > luminance(bg) + 55;
  let label = softUsable ? soft : deriveGoldLabel(accent);
  if (luminance(label) < luminance(bg) + 45) label = mix(label, [255, 255, 255], 0.45);
  return {
    background: rgbCss(bg),
    foreground: rgbCss(fg),
    label: rgbCss(label),
  };
}

/* ── Images (sharp). icon is REQUIRED by Apple and must be opaque. ── */

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Square icon set from the studio's app icon (or logo), flattened onto white so
 * it's always opaque. Falls back to a solid accent square so the pass is always
 * valid even when a tenant has no artwork.
 */
async function buildIconSet(sourceUrl: string | null, accent: Rgb): Promise<Record<string, Buffer>> {
  let base: Buffer | null = null;
  if (sourceUrl) {
    const raw = await fetchImageBuffer(sourceUrl);
    if (raw) {
      try {
        base = await sharp(raw)
          .resize(180, 180, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .png()
          .toBuffer();
      } catch {
        base = null;
      }
    }
  }
  if (!base) {
    base = await sharp({
      create: { width: 180, height: 180, channels: 4, background: { r: accent[0], g: accent[1], b: accent[2], alpha: 1 } },
    })
      .png()
      .toBuffer();
  }
  const src = base;
  const at = (px: number) => sharp(src).resize(px, px).png().toBuffer();
  return {
    "icon.png": await at(29),
    "icon@2x.png": await at(58),
    "icon@3x.png": await at(87),
  };
}

/**
 * Transparent logo set shown on the card front. Prefers the tenant's coach
 * glyph (a simple mark) recoloured to the card foreground — it contrasts with
 * the brand-colour card far better than the full logo, which often shares the
 * brand colour. Falls back to the logo image, then to nothing.
 */
async function buildLogoSet(
  coachIconSvg: string | null,
  logoUrl: string | null,
  fillColor: string,
): Promise<Record<string, Buffer>> {
  let source: Buffer | null = null;
  if (coachIconSvg) {
    // The coach SVG is fill="none" on the root with uncoloured paths (the app
    // tints it via CSS). Inject the foreground colour so it rasterises as a
    // solid, contrasting glyph instead of rendering empty.
    const colored = coachIconSvg
      .replace('fill="none"', `fill="${fillColor}"`)
      .replace(/currentColor/g, fillColor);
    source = Buffer.from(colored, "utf8");
  } else if (logoUrl) {
    source = await fetchImageBuffer(logoUrl);
  }
  if (!source) return {};
  try {
    // density only affects vector (SVG) decoding — ignored for the raster logo.
    const at = (w: number, h: number) =>
      sharp(source, { density: 384 })
        .trim()
        .resize(w, h, { fit: "inside" })
        .png()
        .toBuffer();
    // Half-height vs the 160x50pt max so the mark sits balanced with the logo
    // text rather than dominating the header.
    return {
      "logo.png": await at(80, 25),
      "logo@2x.png": await at(160, 50),
      "logo@3x.png": await at(240, 75),
    };
  } catch {
    return {};
  }
}

/**
 * Square thumbnail (the member's photo) shown on the right in the generic
 * layout, like a driver's license. Skipped when the member has no avatar.
 */
async function buildThumbnailSet(avatarUrl: string | null): Promise<Record<string, Buffer>> {
  if (!avatarUrl) return {};
  const raw = await fetchImageBuffer(avatarUrl);
  if (!raw) return {};
  try {
    const at = (px: number) =>
      sharp(raw).resize(px, px, { fit: "cover" }).png().toBuffer();
    return {
      "thumbnail.png": await at(90),
      "thumbnail@2x.png": await at(180),
      "thumbnail@3x.png": await at(270),
    };
  } catch {
    return {};
  }
}

/* ── Pass assembly ── */

export interface MembershipPassInput {
  /** Stable per (tenant, member) so re-downloading updates the same pass. */
  serialNumber: string;
  studioName: string;
  organizationName: string;
  memberName: string;
  /** The membership/subscription name, e.g. "Ilimitada Mensual". */
  membershipLabel: string;
  levelName: string | null;
  /** Emoji/glyph for the loyalty level, if any. */
  levelIcon: string | null;
  /** "Member since" date, pre-formatted (e.g. "04/24"), if known. */
  memberSince: string | null;
  /** Total classes attended, shown as a stat. */
  totalClasses: number;
  /** Member's avatar URL — shown as the pass thumbnail (photo). */
  avatarUrl: string | null;
  /** QR payload — doubles as the check-in code (validated live at scan time). */
  qrMessage: string;
  /** Optional short code under the QR. Omit for a cleaner card. */
  qrAltText?: string;
  /** PassKit web-service base URL + per-pass token — enables auto-updates. */
  webServiceURL?: string;
  authenticationToken?: string;
  /** When true the pass renders as voided/expired (e.g. membership ended). */
  voided?: boolean;
  branding: {
    colorAccent: string;
    colorHeroBg: string;
    colorAccentSoft: string;
    logoUrl: string | null;
    appIconUrl: string | null;
    coachIconSvg: string | null;
  };
}

export async function generateMembershipPass(input: MembershipPassInput): Promise<Buffer> {
  const certificates = loadCertificates();
  const passTypeIdentifier = process.env.APPLE_PASS_TYPE_ID;
  const teamIdentifier = process.env.APPLE_TEAM_ID;
  if (!certificates || !passTypeIdentifier || !teamIdentifier) {
    throw new Error("Apple Wallet pass is not configured");
  }

  const accent = hexToRgb(input.branding.colorAccent);
  const colors = pickCardColors(
    input.branding.colorAccent,
    input.branding.colorHeroBg,
    input.branding.colorAccentSoft,
  );

  const [icons, logos, thumbnails] = await Promise.all([
    buildIconSet(input.branding.appIconUrl ?? input.branding.logoUrl, accent),
    buildLogoSet(input.branding.coachIconSvg, input.branding.logoUrl, colors.foreground),
    buildThumbnailSet(input.avatarUrl),
  ]);

  const pass = new PKPass(
    { ...icons, ...logos, ...thumbnails },
    {
      wwdr: certificates.wwdr,
      signerCert: certificates.signerCert,
      signerKey: certificates.signerKey,
    },
    {
      passTypeIdentifier,
      teamIdentifier,
      serialNumber: input.serialNumber,
      organizationName: input.organizationName,
      description: `${input.studioName} — Membresía`,
      logoText: input.studioName,
      backgroundColor: colors.background,
      foregroundColor: colors.foreground,
      labelColor: colors.label,
      ...(input.webServiceURL && input.authenticationToken
        ? { webServiceURL: input.webServiceURL, authenticationToken: input.authenticationToken }
        : {}),
      ...(input.voided ? { voided: true } : {}),
    },
  );

  pass.type = "generic";

  pass.setBarcodes(
    input.qrAltText
      ? {
          format: "PKBarcodeFormatQR",
          message: input.qrMessage,
          messageEncoding: "iso-8859-1",
          altText: input.qrAltText,
        }
      : {
          format: "PKBarcodeFormatQR",
          message: input.qrMessage,
          messageEncoding: "iso-8859-1",
        },
  );

  // Membership badge in the top-right corner (repeated in the stats by design).
  pass.headerFields.push({
    key: "membership-badge",
    label: "MEMBRESÍA",
    value: input.membershipLabel,
  });

  // Layout (driver's-license style via the generic pass): the member's NAME as
  // the big primary (label ABOVE the value) with their photo as the thumbnail on
  // the right, then a stats grid below. generic renders secondary + auxiliary as
  // separate rows, so the stats form a clean grid.
  pass.primaryFields.push({
    key: "member",
    label: "NOMBRE",
    value: input.memberName,
  });

  // Stats grid (2 × 2): membership · member-since / classes · level.
  pass.secondaryFields.push({
    key: "membership",
    label: "MEMBRESÍA",
    value: input.membershipLabel,
  });
  if (input.memberSince) {
    pass.secondaryFields.push({
      key: "since",
      label: "MIEMBRO DESDE",
      value: input.memberSince,
    });
  }
  pass.auxiliaryFields.push({
    key: "classes",
    label: "CLASES",
    value: String(input.totalClasses),
  });
  if (input.levelName) {
    pass.auxiliaryFields.push({
      key: "level",
      label: "NIVEL",
      value: input.levelName,
    });
  }
  pass.backFields.push(
    { key: "studio", label: "Estudio", value: input.studioName },
    {
      key: "howto",
      label: "Cómo usar",
      value:
        "Muestra este código QR en recepción para registrar tu asistencia. Los beneficios aplican mientras tu membresía esté activa.",
    },
  );

  return pass.getAsBuffer();
}
