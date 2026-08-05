/**
 * Viewing metrics for on-demand videos.
 *
 * Built from OnDemandStreamSession, which the player now fills with real
 * playback numbers. Sessions recorded before that shipped carry zeros, so
 * every watch-based figure is computed over *measured* sessions only and the
 * count behind it is reported alongside — an average that silently included
 * unmeasured plays would read low and nobody would know why.
 */

export interface SessionSample {
  watchedSeconds: number;
  furthestSeconds: number;
}

export interface WatchStats {
  /** Sessions that carry real playback data. */
  measured: number;
  /** Mean seconds actually played, over measured sessions. */
  avgWatchedSeconds: number;
  /** Mean share of the video reached, 0–100. Null when the runtime is unknown. */
  avgCompletionPct: number | null;
  /** Sessions that reached the finish threshold. */
  finished: number;
}

/**
 * A video counts as finished a little short of the end: closing credits, a
 * cool-down the member skips, or a player that stops reporting at 99%
 * shouldn't turn a completed class into an incomplete one.
 */
export const FINISHED_THRESHOLD = 0.9;

export function summariseSessions(
  sessions: SessionSample[],
  durationSeconds: number | null,
): WatchStats {
  // A session with zero watched time is either pre-measurement or someone who
  // opened and never pressed play. Neither belongs in an average of how long
  // people watch.
  const measured = sessions.filter((s) => s.watchedSeconds > 0);
  if (measured.length === 0) {
    return { measured: 0, avgWatchedSeconds: 0, avgCompletionPct: null, finished: 0 };
  }

  const totalWatched = measured.reduce((sum, s) => sum + s.watchedSeconds, 0);

  let avgCompletionPct: number | null = null;
  let finished = 0;
  if (durationSeconds && durationSeconds > 0) {
    const shares = measured.map((s) =>
      // Cap at 1: a player reporting past the end shouldn't produce 103%.
      Math.min(1, s.furthestSeconds / durationSeconds),
    );
    avgCompletionPct = Math.round(
      (shares.reduce((sum, v) => sum + v, 0) / shares.length) * 100,
    );
    finished = shares.filter((v) => v >= FINISHED_THRESHOLD).length;
  }

  return {
    measured: measured.length,
    avgWatchedSeconds: Math.round(totalWatched / measured.length),
    avgCompletionPct,
    finished,
  };
}

/** "5:46" — compact enough for a table cell. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}
