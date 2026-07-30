/**
 * Row divisions for the admin schedule grid.
 *
 * By default the grid is one row per hour. A studio whose classes run on an
 * off-hour cadence (07:00, 08:10, 09:20…) configures the exact start times on
 * `Tenant.scheduleSlotTimes`, so clicking an empty cell prefills the real
 * class time instead of the top of the hour.
 */

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const MAX_SLOTS = 48;

export function parseSlotTime(value: string): number | null {
  const m = HHMM.exec(value.trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function formatSlotTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Normalize a raw list into unique, sorted, valid "HH:MM" strings.
 * Returns null when any entry is malformed so the caller can 400.
 */
export function normalizeSlotTimes(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const minutes: number[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") return null;
    const parsed = parseSlotTime(entry);
    if (parsed === null) return null;
    if (!minutes.includes(parsed)) minutes.push(parsed);
  }
  if (minutes.length > MAX_SLOTS) return null;
  minutes.sort((a, b) => a - b);
  return minutes.map(formatSlotTime);
}

/**
 * The grid's row start minutes. Configured slots win; otherwise one row per
 * hour across the studio's open window.
 */
export function resolveSlotStarts(
  slotTimes: string[] | null | undefined,
  openHour: number,
  closeHour: number,
): number[] {
  const configured = (slotTimes ?? [])
    .map(parseSlotTime)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  if (configured.length > 0) return configured;

  const from = Math.max(0, Math.min(23, openHour));
  const to = Math.max(from + 1, Math.min(24, closeHour));
  return Array.from({ length: to - from }, (_, i) => (from + i) * 60);
}

/**
 * Which row a class belongs to: the last slot starting at or before it.
 * A class earlier than the first slot still lands in row 0 rather than
 * disappearing from the grid — its card shows the real time anyway.
 */
export function slotIndexFor(starts: number[], minuteOfDay: number): number {
  if (starts.length === 0) return 0;
  let index = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= minuteOfDay) index = i;
    else break;
  }
  return index;
}

/** Evenly spaced starts — what the "generate" control in the editor produces. */
export function generateSlotTimes(
  firstTime: string,
  intervalMinutes: number,
  count: number,
): string[] {
  const start = parseSlotTime(firstTime);
  if (start === null || intervalMinutes < 5 || count < 1) return [];
  const out: string[] = [];
  for (let i = 0; i < Math.min(count, MAX_SLOTS); i++) {
    const m = start + i * intervalMinutes;
    if (m >= 24 * 60) break;
    out.push(formatSlotTime(m));
  }
  return out;
}
