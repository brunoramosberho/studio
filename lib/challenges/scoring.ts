/**
 * Pure scoring rules for challenges — no database, so they can be unit
 * tested and dry-run against historical data before a challenge exists.
 *
 * The engine (engine.ts) does the DB work and delegates every "how many
 * points is this class worth" decision here.
 */

export type PointKind = "BASE" | "FIRST_DISCIPLINE" | "FIRST_COACH" | "OFF_PEAK";

export interface BonusSlot {
  dayOfWeek: number; // 0 = Sunday, studio-local
  hour: number; // studio-local hour
  points: number;
}

export interface ChallengeRules {
  basePoints: number;
  firstDisciplineBonus: number;
  firstCoachBonus: number;
  /** null = no cap on a single day. */
  dailyPointsCap: number | null;
  bonusSlots: BonusSlot[];
}

/** What the participant has already earned, as far as scoring cares. */
export interface ParticipantLedger {
  /** Disciplines already scored in THIS challenge. */
  disciplineIds: Set<string>;
  /** Coaches already scored in THIS challenge. */
  coachIds: Set<string>;
  /**
   * CAPPABLE points already earned per studio-local date, "YYYY-MM-DD".
   * First-time bonuses are excluded — see applyDailyCap.
   */
  pointsByDate: Map<string, number>;
}

export interface ScorableClass {
  classTypeId: string;
  coachId: string;
  /** Studio-local calendar date, "YYYY-MM-DD". */
  localDate: string;
  /** Studio-local day of week, 0 = Sunday. */
  dayOfWeek: number;
  /** Studio-local start hour. */
  hour: number;
}

export interface AwardedEntry {
  kind: PointKind;
  points: number;
}

export function emptyLedger(): ParticipantLedger {
  return {
    disciplineIds: new Set(),
    coachIds: new Set(),
    pointsByDate: new Map(),
  };
}

/**
 * Points for one attended class. Returns the entries to write (possibly
 * several kinds for the same class) after applying the daily cap.
 *
 * "First" means first WITHIN THIS CHALLENGE — trying an instructor you
 * already knew still counts, which is the point of the bonus: it nudges
 * variety during the challenge, not lifetime firsts.
 */
export function scoreClass(
  cls: ScorableClass,
  rules: ChallengeRules,
  ledger: ParticipantLedger,
): AwardedEntry[] {
  const entries: AwardedEntry[] = [];

  if (rules.basePoints > 0) {
    entries.push({ kind: "BASE", points: rules.basePoints });
  }
  if (rules.firstDisciplineBonus > 0 && !ledger.disciplineIds.has(cls.classTypeId)) {
    entries.push({ kind: "FIRST_DISCIPLINE", points: rules.firstDisciplineBonus });
  }
  if (rules.firstCoachBonus > 0 && !ledger.coachIds.has(cls.coachId)) {
    entries.push({ kind: "FIRST_COACH", points: rules.firstCoachBonus });
  }
  const slot = rules.bonusSlots.find(
    (b) => b.dayOfWeek === cls.dayOfWeek && b.hour === cls.hour,
  );
  if (slot && slot.points > 0) {
    entries.push({ kind: "OFF_PEAK", points: slot.points });
  }

  return applyDailyCap(entries, cls.localDate, rules, ledger);
}

/**
 * Kinds the daily cap applies to. First-time bonuses are exempt: they can
 * only be earned once per discipline and once per instructor for the whole
 * challenge, so they can't be farmed by stacking classes into one day — and
 * capping them would cancel the exact behaviour the challenge is buying.
 * The cap exists to stop someone taking four classes on Saturday from
 * outrunning someone who showed up four separate days.
 */
const CAPPABLE: PointKind[] = ["BASE", "OFF_PEAK"];

/** Trim the day's cappable points so they never exceed the cap. */
function applyDailyCap(
  entries: AwardedEntry[],
  localDate: string,
  rules: ChallengeRules,
  ledger: ParticipantLedger,
): AwardedEntry[] {
  if (rules.dailyPointsCap == null) return entries;
  let room = rules.dailyPointsCap - (ledger.pointsByDate.get(localDate) ?? 0);

  const trimmed: AwardedEntry[] = [];
  for (const entry of entries) {
    if (!CAPPABLE.includes(entry.kind)) {
      trimmed.push(entry);
      continue;
    }
    if (room <= 0) continue;
    const points = Math.min(entry.points, room);
    trimmed.push({ ...entry, points });
    room -= points;
  }
  return trimmed;
}

/** Fold an award into the ledger so the next class scores against it. */
export function applyToLedger(
  ledger: ParticipantLedger,
  cls: ScorableClass,
  entries: AwardedEntry[],
): void {
  if (entries.length === 0) return;
  ledger.disciplineIds.add(cls.classTypeId);
  ledger.coachIds.add(cls.coachId);
  const cappable = entries
    .filter((e) => CAPPABLE.includes(e.kind))
    .reduce((sum, e) => sum + e.points, 0);
  ledger.pointsByDate.set(
    cls.localDate,
    (ledger.pointsByDate.get(cls.localDate) ?? 0) + cappable,
  );
}

/**
 * Streaks over the days the member actually earned points, counted in
 * studio-local dates. `currentStreak` only survives if the last active day
 * is today or yesterday — otherwise it's broken, not paused.
 */
export function computeStreaks(
  dates: string[],
  today: string,
): { current: number; longest: number } {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i++) {
    run = isNextDay(unique[i - 1], unique[i]) ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const last = unique[unique.length - 1];
  const current = last === today || isNextDay(last, today) ? run : 0;
  return { current, longest };
}

function isNextDay(a: string, b: string): boolean {
  const d = new Date(`${a}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10) === b;
}

/**
 * Ranking score while the challenge runs: points per elapsed day, so
 * someone on day 3 isn't buried under someone on day 28. The floor stops a
 * single class on day 1 from showing a perfect pace — below it the member
 * is "starting", not ranked.
 */
export const PACE_MIN_DAYS = 3;

export function pace(points: number, daysElapsed: number): number | null {
  if (daysElapsed < PACE_MIN_DAYS) return null;
  return Math.round((points / daysElapsed) * 100) / 100;
}
