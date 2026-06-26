// Pure class-matching for Wellhub check-ins. No I/O so it can be unit-tested
// exhaustively.
//
// The `checkin` webhook tells us WHO checked in and WHEN, but not WHICH class
// (only `checkin-booking-occurred` carries a booking_number, and we don't
// subscribe to it). So we infer the class by time: a member checks in close to
// the start of THEIR class, so the class whose start is nearest the check-in
// time — within a sane window — is the right one.
//
// Two callers use this:
//   - Reservation match (Silvia): candidates = the user's own bookings.
//   - Walk-in match (Mayte): candidates = all studio classes for the product.

const WINDOW_BEFORE_START_MS = 45 * 60 * 1000; // check-in up to 45m before start
const WINDOW_AFTER_END_MS = 30 * 60 * 1000; // …until 30m after the class ends

export interface ClassCandidate {
  /** Stable id passed through to the result. */
  id: string;
  startsAt: Date;
  endsAt: Date;
}

export interface MatchResult<T extends ClassCandidate> {
  match: T | null;
  /** Why no match, for logging/alerts. */
  reason?: "no_candidates" | "none_in_window";
}

/**
 * Pick the candidate class whose start is nearest the check-in time, as long
 * as the check-in falls inside that class's window
 * [startsAt − 45m, endsAt + 30m]. Ties (equal distance) prefer the EARLIER
 * class deterministically.
 */
export function pickClosestClass<T extends ClassCandidate>(
  candidates: T[],
  checkinAt: Date,
  window: { beforeStartMs?: number; afterEndMs?: number } = {},
): MatchResult<T> {
  if (candidates.length === 0) return { match: null, reason: "no_candidates" };

  const beforeStart = window.beforeStartMs ?? WINDOW_BEFORE_START_MS;
  const afterEnd = window.afterEndMs ?? WINDOW_AFTER_END_MS;
  const t = checkinAt.getTime();

  let best: T | null = null;
  let bestDist = Infinity;

  for (const c of candidates) {
    const start = c.startsAt.getTime();
    const end = c.endsAt.getTime();
    // Inside the acceptance window for this class?
    if (t < start - beforeStart || t > end + afterEnd) continue;

    const dist = Math.abs(t - start);
    // Strictly-less keeps the FIRST (earliest, since we don't sort) on ties;
    // to be deterministic regardless of input order, prefer the earlier start.
    if (dist < bestDist || (dist === bestDist && best != null && start < best.startsAt.getTime())) {
      best = c;
      bestDist = dist;
    }
  }

  if (!best) return { match: null, reason: "none_in_window" };
  return { match: best };
}

export const __MATCH_WINDOW = { WINDOW_BEFORE_START_MS, WINDOW_AFTER_END_MS };
