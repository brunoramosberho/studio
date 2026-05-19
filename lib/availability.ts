import { prisma } from "@/lib/db";
import { getWallClockInZone } from "@/lib/utils";
import {
  startOfWeek,
  endOfWeek,
  startOfDay,
  eachDayOfInterval,
} from "date-fns";

// ── Zone (red/yellow/green) — coach self-service approval gating ──────
// Unchanged from before. Time-off requests (or any change) close to the date
// land in pending_approval (yellow) or are admin-only (red).

export type Zone = "green" | "yellow" | "red";

export interface ZoneThresholds {
  zoneRedDays?: number;
  zoneYellowDays?: number;
}

const DEFAULT_RED = 14;
const DEFAULT_YELLOW = 30;

export function getZone(
  startDate: Date,
  thresholds?: ZoneThresholds,
): Zone {
  const redDays = thresholds?.zoneRedDays ?? DEFAULT_RED;
  const yellowDays = thresholds?.zoneYellowDays ?? DEFAULT_YELLOW;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (startDate.getTime() - today.getTime()) / 86_400_000;
  if (diffDays < redDays) return "red";
  if (diffDays < yellowDays) return "yellow";
  return "green";
}

export function getStatusForZone(zone: Zone): "active" | "pending_approval" {
  if (zone === "yellow") return "pending_approval";
  if (zone === "red")
    throw new Error("Cambios en zona roja solo los puede hacer el admin");
  return "active";
}

// ── Time helpers ──────────────────────────────────────────────────────
// We store startTime/endTime as "HH:MM" strings. Coaches paint slots on a
// 15-minute grid; the engine works in "minutes since midnight" so we can do
// integer math instead of fighting Date objects.

export const SLOT_MINUTES = 30;

export function parseHhmm(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^([0-9]{1,2}):([0-9]{2})$/.exec(value);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** True iff value is a non-negative multiple of SLOT_MINUTES. */
export function isAlignedToSlot(minutes: number): boolean {
  return minutes >= 0 && minutes % SLOT_MINUTES === 0;
}

/**
 * Treat Monday as 0 to match the schema's `dayOfWeek` convention
 * (0=Mon, 1=Tue, ..., 6=Sun). JS Date.getDay() returns 0=Sun..6=Sat.
 */
export function getMondayBasedDow(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

// ── Block types (lite shapes consumed by the engine) ──────────────────

export type AvailabilityKind = "availability" | "time_off";
export type StudioPreference = "preferred" | "ok_if_needed";

export interface AvailabilityBlockLite {
  kind: AvailabilityKind;
  type: "recurring" | "one_time";
  dayOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isAllDay: boolean;
  status: string; // "active" | "pending_approval" | "rejected"
  studioPreferences?: { studioId: string; preference: StudioPreference }[];
}

// ── Core query: does a block cover a (date, [startMin, endMin)) range? ─

interface CoverageRange {
  startMin: number;
  endMin: number;
}

/**
 * Returns the [startMin, endMin) ranges of this block that fall on `date`.
 * If the block doesn't apply to that date at all, returns `[]`. For all-day
 * blocks the returned range is [0, 1440).
 */
function blockCoverageOnDate(
  block: AvailabilityBlockLite,
  date: Date,
): CoverageRange[] {
  const dayStart = startOfDay(date);

  if (block.type === "one_time") {
    if (!block.startDate || !block.endDate) return [];
    const s = startOfDay(block.startDate);
    const e = startOfDay(block.endDate);
    if (dayStart < s || dayStart > e) return [];
  } else {
    // recurring
    if (!block.dayOfWeek.includes(getMondayBasedDow(date))) return [];
  }

  if (block.isAllDay && block.type === "one_time") {
    return [{ startMin: 0, endMin: 24 * 60 }];
  }

  const startMin = parseHhmm(block.startTime);
  const endMin = parseHhmm(block.endTime);
  if (startMin == null || endMin == null) {
    // recurring/one-time without explicit time bounds — be conservative
    // and treat as all day so we don't accidentally schedule a class on
    // top of a malformed block.
    return [{ startMin: 0, endMin: 24 * 60 }];
  }
  if (endMin <= startMin) return [];
  return [{ startMin, endMin }];
}

function rangesOverlap(a: CoverageRange, b: CoverageRange): boolean {
  return a.startMin < b.endMin && a.endMin > b.startMin;
}

/**
 * Subtract `cuts` from `base`, returning the remaining ranges.
 * Used to apply time_off blocks on top of availability blocks.
 */
function subtractRanges(
  base: CoverageRange[],
  cuts: CoverageRange[],
): CoverageRange[] {
  let result = base.slice();
  for (const cut of cuts) {
    const next: CoverageRange[] = [];
    for (const r of result) {
      if (!rangesOverlap(r, cut)) {
        next.push(r);
        continue;
      }
      if (cut.startMin > r.startMin) {
        next.push({ startMin: r.startMin, endMin: Math.min(r.endMin, cut.startMin) });
      }
      if (cut.endMin < r.endMin) {
        next.push({ startMin: Math.max(r.startMin, cut.endMin), endMin: r.endMin });
      }
    }
    result = next.filter((r) => r.endMin > r.startMin);
  }
  return result;
}

function mergeRanges(ranges: CoverageRange[]): CoverageRange[] {
  if (ranges.length === 0) return [];
  const sorted = ranges.slice().sort((a, b) => a.startMin - b.startMin);
  const out: CoverageRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, cur.endMin);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

// ── Engine: per-slot status for a coach ────────────────────────────────

export type CoachSlotStatus =
  | "preferred"
  | "ok_if_needed"
  | "unavailable"
  | "time_off";

/**
 * What is this coach's status for the [startMin, endMin) window on `date`
 * at the given `studioId`?
 *
 * - "time_off"     → an explicit time_off block covers this window
 * - "unavailable"  → no availability block covers, or the studio isn't in
 *                    the covering block's studio preferences
 * - "preferred"    → covered by an availability block whose studio pref is preferred
 * - "ok_if_needed" → covered by an availability block whose studio pref is ok_if_needed
 *
 * If the window straddles multiple availability blocks with different prefs,
 * the highest-priority one (preferred > ok_if_needed) wins.
 *
 * When `studioId` is an empty string (or omitted), the coach is evaluated
 * against the BEST preference across all studios — useful for early-stage
 * pickers where the admin hasn't selected a room yet, so we don't
 * artificially mark the coach as unavailable.
 *
 * When checking time-off overlap we treat both `active` and `pending_approval`
 * as blocking, the same conservative rule we used before — admins should
 * resolve the pending request before assigning.
 */
export function getCoachStatusForSlot(args: {
  blocks: AvailabilityBlockLite[];
  date: Date;
  startMin: number;
  endMin: number;
  studioId: string;
}): CoachSlotStatus {
  const { blocks, date, startMin, endMin, studioId } = args;
  const slot: CoverageRange = { startMin, endMin };
  const studioAgnostic = !studioId;

  // 1) Time-off check (active + pending_approval both block).
  for (const b of blocks) {
    if (b.kind !== "time_off") continue;
    if (b.status !== "active" && b.status !== "pending_approval") continue;
    const cov = blockCoverageOnDate(b, date);
    if (cov.some((c) => rangesOverlap(c, slot))) {
      return "time_off";
    }
  }

  // 2) Availability check. Only active availability blocks count — a
  //    pending one shouldn't reserve the coach for a slot they haven't
  //    been approved to take yet.
  let best: CoachSlotStatus = "unavailable";
  for (const b of blocks) {
    if (b.kind !== "availability") continue;
    if (b.status !== "active") continue;
    const cov = blockCoverageOnDate(b, date);
    if (!cov.some((c) => rangesOverlap(c, slot))) continue;

    if (studioAgnostic) {
      // No specific studio context — take the best preference present on
      // this block regardless of which location it points at.
      for (const p of b.studioPreferences ?? []) {
        if (p.preference === "preferred") return "preferred";
        if (p.preference === "ok_if_needed" && best === "unavailable") {
          best = "ok_if_needed";
        }
      }
      continue;
    }

    const pref = b.studioPreferences?.find((p) => p.studioId === studioId);
    if (!pref) continue;
    if (pref.preference === "preferred") return "preferred";
    if (pref.preference === "ok_if_needed" && best === "unavailable") {
      best = "ok_if_needed";
    }
  }
  return best;
}

// ── Day-level coverage status for calendar badges ─────────────────────

export type CoverageStatus =
  | "available"
  | "partial"
  | "blocked"
  | "pending"
  | "empty";

/**
 * Compact day badge used by admin coverage views. Looks at the union of all
 * availability ranges minus time_off for the day; ignores studio prefs.
 *
 * - "blocked" → time_off covers the whole day (or there's a pending time_off)
 * - "pending" → a pending_approval time_off exists for this day
 * - "available" → no availability blocks (empty) OR fully covered by availability
 * - "partial" → some availability, but not the whole day, or part of day is time_off
 */
export function getCoverageStatus(
  blocks: AvailabilityBlockLite[],
  date: Date,
): CoverageStatus {
  const timeOffRanges: CoverageRange[] = [];
  let pendingTimeOff = false;
  const availabilityRanges: CoverageRange[] = [];

  for (const b of blocks) {
    const cov = blockCoverageOnDate(b, date);
    if (cov.length === 0) continue;
    if (b.kind === "time_off") {
      if (b.status === "pending_approval") {
        pendingTimeOff = true;
      } else if (b.status === "active") {
        timeOffRanges.push(...cov);
      }
    } else if (b.kind === "availability" && b.status === "active") {
      availabilityRanges.push(...cov);
    }
  }

  const fullDay = 24 * 60;
  const mergedTimeOff = mergeRanges(timeOffRanges);

  if (mergedTimeOff.some((r) => r.startMin <= 0 && r.endMin >= fullDay)) {
    return "blocked";
  }
  if (pendingTimeOff && mergedTimeOff.length === 0 && availabilityRanges.length === 0) {
    return "pending";
  }

  if (availabilityRanges.length === 0) {
    // No positive availability defined. We treat "empty" as available so
    // coaches who never set up a calendar don't disappear from suggestions.
    // Admins can interpret it via the per-coach summary.
    return mergedTimeOff.length > 0 ? "partial" : "available";
  }

  const remaining = subtractRanges(mergeRanges(availabilityRanges), mergedTimeOff);
  const totalAvail = remaining.reduce((sum, r) => sum + (r.endMin - r.startMin), 0);
  if (totalAvail <= 0) return "blocked";
  if (pendingTimeOff) return "pending";
  return "partial";
}

// ── Substitute suggestions (used by /admin/substitutions, AI executor) ──

export async function getSubstituteSuggestions(
  classId: string,
  date: Date,
  tenantId: string,
) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      classType: true,
      coach: { select: { userId: true } },
      room: {
        select: {
          studioId: true,
          studio: { select: { city: { select: { timezone: true } } } },
        },
      },
    },
  });
  if (!cls) return [];

  const allProfiles = await prisma.coachProfile.findMany({
    where: { tenantId, userId: { not: cls.coach.userId } },
    include: { user: { select: { id: true, image: true } } },
  });

  const coachUserIds = allProfiles
    .map((p) => p.userId)
    .filter((id): id is string => id != null);

  const allBlocks = await prisma.coachAvailabilityBlock.findMany({
    where: {
      tenantId,
      coachId: { in: coachUserIds },
    },
    include: {
      studioPreferences: { select: { studioId: true, preference: true } },
    },
  });

  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  eachDayOfInterval({ start: weekStart, end: weekEnd });

  const weekClasses = await prisma.class.findMany({
    where: {
      tenantId,
      startsAt: { gte: weekStart, lte: weekEnd },
      status: "SCHEDULED",
    },
    select: { coachId: true },
  });

  const classCountByProfile: Record<string, number> = {};
  for (const c of weekClasses) {
    classCountByProfile[c.coachId] = (classCountByProfile[c.coachId] || 0) + 1;
  }

  const discipline = cls.classType.name.toLowerCase();
  // Convert UTC instants to studio wall time so we compare against coach
  // availability (stored as wall "HH:MM").
  const tz = cls.room?.studio?.city?.timezone ?? "Europe/Madrid";
  const startWall = getWallClockInZone(cls.startsAt, tz);
  const endWall = getWallClockInZone(cls.endsAt, tz);
  const classStartMin = startWall.hour * 60 + startWall.minute;
  const classEndMin = endWall.hour * 60 + endWall.minute;
  const slotDate = new Date(startWall.year, startWall.month - 1, startWall.day);
  const studioId = cls.room?.studioId ?? "";

  type Suggestion = {
    coachProfileId: string;
    userId: string;
    name: string;
    image: string | null;
    available: boolean;
    slotStatus: CoachSlotStatus;
    hasDiscipline: boolean;
    weekLoad: number;
  };

  const suggestions: Suggestion[] = allProfiles.map((p) => {
    const coachBlocks = allBlocks.filter((b) => b.coachId === p.userId);
    const slotStatus = getCoachStatusForSlot({
      blocks: coachBlocks,
      date: slotDate,
      startMin: classStartMin,
      endMin: classEndMin,
      studioId,
    });
    // "available" here drives whether we surface the coach in the green
    // shortlist. A coach with no availability defined at all still falls
    // under "unavailable" for studio prefs — but to keep the legacy
    // behaviour ("if you haven't configured your calendar, you might still
    // get suggested") we treat coaches with zero availability blocks as
    // available.
    const hasAnyAvailabilityBlock = coachBlocks.some(
      (b) => b.kind === "availability",
    );
    const treatAsAvailable = hasAnyAvailabilityBlock
      ? slotStatus === "preferred" || slotStatus === "ok_if_needed"
      : slotStatus !== "time_off";
    const hasDiscipline = p.specialties.some(
      (s) => s.toLowerCase() === discipline,
    );
    const weekLoad = classCountByProfile[p.id] || 0;

    return {
      coachProfileId: p.id,
      userId: p.userId ?? "",
      name: p.name || "Coach",
      image: p.user?.image ?? null,
      available: treatAsAvailable,
      slotStatus,
      hasDiscipline,
      weekLoad,
    };
  });

  const priority: Record<CoachSlotStatus, number> = {
    preferred: 0,
    ok_if_needed: 1,
    unavailable: 2,
    time_off: 3,
  };

  suggestions.sort((a, b) => {
    if (a.slotStatus !== b.slotStatus) return priority[a.slotStatus] - priority[b.slotStatus];
    if (a.hasDiscipline !== b.hasDiscipline) return a.hasDiscipline ? -1 : 1;
    return a.weekLoad - b.weekLoad;
  });

  return suggestions;
}

// ── Deprecated: legacy hour-based helper kept for transition only ─────
// New callers should use `getCoachStatusForSlot` with explicit minute
// bounds + a studioId. This helper preserves the old "is this hour blocked
// by a time_off block?" semantic so any straggler caller still behaves.

export function isHourBlocked(
  blocks: AvailabilityBlockLite[],
  date: Date,
  hour: number,
): boolean {
  const startMin = hour * 60;
  const endMin = startMin + 60;
  const slot: CoverageRange = { startMin, endMin };
  for (const b of blocks) {
    if (b.kind !== "time_off") continue;
    if (b.status !== "active" && b.status !== "pending_approval") continue;
    const cov = blockCoverageOnDate(b, date);
    if (cov.some((c) => rangesOverlap(c, slot))) return true;
  }
  return false;
}
