/**
 * How an instructor's name is shown on the schedule.
 *
 * First names alone aren't enough to tell people apart: FDV has three Sofias,
 * three Marias and two Paulinas; betoro has two Reginas. A client picking a
 * class can't tell which one they're booking.
 *
 * Full names don't fit the compact cells, so this shows "first name + surname
 * initial" — short enough for a chip, specific enough to disambiguate every
 * real collision in the roster today.
 */

/**
 * Particles that start a compound surname. Taking the second word blindly
 * turns "Sofia de Palacio" into "Sofia de" and "Paulina de la Concha" into
 * "Paulina de" — which distinguishes nobody, and is exactly the case a naive
 * split gets wrong.
 */
const SURNAME_PARTICLES = new Set([
  "de",
  "del",
  "la",
  "las",
  "lo",
  "los",
  "y",
  "da",
  "das",
  "do",
  "dos",
  "van",
  "von",
  "di",
  "du",
  "le",
  "el",
  "san",
  "santa",
  "bin",
  "al",
]);

/** The first meaningful surname token, skipping particles. */
export function surnameOf(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  for (const part of parts.slice(1)) {
    if (!SURNAME_PARTICLES.has(part.toLowerCase())) return part;
  }
  // All particles after the first name — nothing meaningful to show.
  return null;
}

export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/**
 * "Sofia de Palacio" → "Sofia P."  ·  "Zarina" → "Zarina"
 *
 * `letters` controls how much of the surname to show; 1 resolves every
 * collision in the current rosters, and more can be asked for where there's
 * room.
 */
export function shortCoachName(
  fullName: string | null | undefined,
  letters = 1,
): string {
  const name = (fullName ?? "").trim();
  if (!name) return "";

  const first = firstNameOf(name);
  const surname = surnameOf(name);
  if (!surname) return first;

  const piece = surname.slice(0, Math.max(1, letters));
  // No trailing dot when the whole surname is already shown — "Mer H." is an
  // abbreviation, "Ana Paz" is not.
  const abbreviated = piece.length < surname.length;
  return `${first} ${piece}${abbreviated || piece.length === 1 ? "." : ""}`;
}
