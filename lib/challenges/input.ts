/**
 * Parsing and validation for challenge configuration coming from the admin
 * form. Shared by create and update so the two can't drift.
 */

import type { Prisma } from "@prisma/client";
import type { BonusSlot } from "./scoring";

export interface Prize {
  fromRank: number;
  toRank: number;
  title: string;
}

export interface ChallengeInput {
  name: string;
  description: string | null;
  imageUrl: string | null;
  durationDays: number;
  enrollOpensAt: Date;
  enrollClosesAt: Date;
  studioIds: string[];
  basePoints: number;
  firstDisciplineBonus: number;
  firstCoachBonus: number;
  photoBonus: number;
  dailyPointsCap: number | null;
  bonusSlots: BonusSlot[];
  prizes: Prize[];
}

export const MAX_DURATION_DAYS = 365;
export const MAX_POINTS = 1000;

export class ChallengeInputError extends Error {}

function fail(message: string): never {
  throw new ChallengeInputError(message);
}

function int(raw: unknown, field: string, { min, max }: { min: number; max: number }): number {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    fail(`${field} must be a whole number`);
  }
  if (n < min || n > max) fail(`${field} must be between ${min} and ${max}`);
  return n;
}

/**
 * `dayStart` turns a "YYYY-MM-DD" from the form into an instant, so the caller
 * decides the timezone (studio-local, never the admin's browser).
 */
export function parseChallengeInput(
  body: Record<string, unknown>,
  dayStart: (date: string, endOfDay: boolean) => Date,
): ChallengeInput {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) fail("name is required");
  if (name.length > 80) fail("name is too long");

  const opensRaw = body.enrollOpensAt;
  const closesRaw = body.enrollClosesAt;
  if (typeof opensRaw !== "string" || typeof closesRaw !== "string") {
    fail("enrollment dates are required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opensRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(closesRaw)) {
    fail("enrollment dates must be YYYY-MM-DD");
  }
  const enrollOpensAt = dayStart(opensRaw, false);
  const enrollClosesAt = dayStart(closesRaw, true);
  if (enrollClosesAt <= enrollOpensAt) fail("enrollment must close after it opens");

  const dailyCapRaw = body.dailyPointsCap;
  const dailyPointsCap =
    dailyCapRaw == null || dailyCapRaw === "" || dailyCapRaw === 0
      ? null
      : int(dailyCapRaw, "dailyPointsCap", { min: 1, max: MAX_POINTS });

  const basePoints = int(body.basePoints ?? 10, "basePoints", { min: 0, max: MAX_POINTS });
  if (basePoints === 0 && dailyPointsCap != null) {
    // A cap with no base points can only ever trim the off-peak bonus, which
    // reads as a bug from the admin's side. Make them pick one.
    fail("a daily cap needs base points to cap");
  }

  return {
    name,
    description:
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null,
    imageUrl: parseImageUrl(body.imageUrl),
    durationDays: int(body.durationDays ?? 30, "durationDays", { min: 1, max: MAX_DURATION_DAYS }),
    enrollOpensAt,
    enrollClosesAt,
    studioIds: Array.isArray(body.studioIds)
      ? body.studioIds.filter((s): s is string => typeof s === "string")
      : [],
    basePoints,
    firstDisciplineBonus: int(body.firstDisciplineBonus ?? 15, "firstDisciplineBonus", {
      min: 0,
      max: MAX_POINTS,
    }),
    firstCoachBonus: int(body.firstCoachBonus ?? 10, "firstCoachBonus", {
      min: 0,
      max: MAX_POINTS,
    }),
    photoBonus: int(body.photoBonus ?? 0, "photoBonus", { min: 0, max: MAX_POINTS }),
    dailyPointsCap,
    bonusSlots: parseBonusSlots(body.bonusSlots),
    prizes: parsePrizes(body.prizes),
  };
}

/**
 * Only our own uploaded images. A challenge badge is rendered inside the
 * member's feed, so an arbitrary URL here would be someone else's server
 * deciding what our members see.
 */
export function parseImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const url = raw.trim();
  if (url.length > 500) fail("image URL is too long");
  if (!/^https?:\/\//.test(url) && !url.startsWith("/")) fail("invalid image URL");
  return url;
}

function parseBonusSlots(raw: unknown): BonusSlot[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const dayOfWeek = int(o.dayOfWeek, "bonusSlot.dayOfWeek", { min: 0, max: 6 });
    const hour = int(o.hour, "bonusSlot.hour", { min: 0, max: 23 });
    const points = int(o.points, "bonusSlot.points", { min: 1, max: MAX_POINTS });
    const key = `${dayOfWeek}|${hour}`;
    if (seen.has(key)) fail("the same slot is listed twice");
    seen.add(key);
    return { dayOfWeek, hour, points };
  });
}

function parsePrizes(raw: unknown): Prize[] {
  if (!Array.isArray(raw)) return [];
  const prizes = raw.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const fromRank = int(o.fromRank, "prize.fromRank", { min: 1, max: 9999 });
    const toRank = int(o.toRank ?? o.fromRank, "prize.toRank", { min: 1, max: 9999 });
    if (toRank < fromRank) fail("a prize range must end at or after it starts");
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) fail("every prize needs a name");
    if (title.length > 80) fail("prize name is too long");
    return { fromRank, toRank, title };
  });
  // Overlapping ranges would make "who won what" ambiguous at the end.
  const sorted = [...prizes].sort((a, b) => a.fromRank - b.fromRank);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].fromRank <= sorted[i - 1].toRank) fail("prize positions overlap");
  }
  return prizes;
}

/** When the last possible participant window closes. */
export function challengeEndsAt(enrollClosesAt: Date, durationDays: number): Date {
  const end = new Date(enrollClosesAt);
  end.setUTCDate(end.getUTCDate() + durationDays);
  return end;
}

/**
 * Prisma types Json columns as InputJsonValue, which our structured arrays
 * don't structurally satisfy. One conversion point instead of a cast at each
 * call site.
 */
export function toChallengeData(input: ChallengeInput) {
  return {
    ...input,
    bonusSlots: input.bonusSlots as unknown as Prisma.InputJsonValue,
    prizes: input.prizes as unknown as Prisma.InputJsonValue,
  };
}
