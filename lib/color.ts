/**
 * Contrast helpers for tenant-chosen colors.
 *
 * Studios pick their own discipline/coach colors, so any surface that paints
 * text on top of one can't assume white reads well — a pale sand and a deep
 * navy both show up in the same grid. These use the WCAG relative-luminance
 * formula (perceptual, unlike a raw RGB average) and pick whichever of the
 * two candidates actually contrasts more.
 */

export type Rgb = [number, number, number];

/** Near-black default: stone-900, softer on the eye than pure #000. */
export const DARK_TEXT = "#1c1917";
export const LIGHT_TEXT = "#ffffff";

export function hexToRgb(hex: string): Rgb | null {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two luminances, 1 … 21. */
export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Black or white text for a background, whichever contrasts more.
 * Unparseable/missing colors fall back to white (the historic default).
 */
export function readableTextColor(background: string | null | undefined): string {
  if (!background) return LIGHT_TEXT;
  const rgb = hexToRgb(background);
  if (!rgb) return LIGHT_TEXT;
  const bg = relativeLuminance(rgb);
  const onLight = contrastRatio(bg, relativeLuminance(hexToRgb(DARK_TEXT)!));
  const onWhite = contrastRatio(bg, 1);
  return onLight >= onWhite ? DARK_TEXT : LIGHT_TEXT;
}

/** True when a background needs dark text to be legible. */
export function needsDarkText(background: string | null | undefined): boolean {
  return readableTextColor(background) === DARK_TEXT;
}

/** Same color with an alpha channel, for borders/overlays derived from text. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}${a
    .toString(16)
    .padStart(2, "0")}`;
}
