/**
 * Shared client helper for the curated-packages (decoy-effect) display. The admin
 * picks an ordered set of packages (with one "recommended" preferred pick) per
 * audience; the booking flow + /packages show that set first and tuck the rest
 * behind a "see more". When curation is off or empty, the full list is shown.
 */

export type CurationAudience = "firstTimer" | "returning";

export interface PackageCuration {
  enabled: boolean;
  firstTimer: { ids: string[]; recommendedId: string | null };
  returning: { ids: string[]; recommendedId: string | null };
}

export interface CuratedSplit<T> {
  /** True when a curated set actually applies (enabled + at least one match). */
  isCurated: boolean;
  /** The curated packages, in the admin's order. */
  curated: T[];
  /** Everything else, for the "see more" reveal. */
  rest: T[];
  /** The preferred pick to badge as "recommended" (within `curated`). */
  recommendedId: string | null;
}

export function splitCuratedPackages<T extends { id: string }>(
  packages: T[],
  curation: PackageCuration | undefined | null,
  audience: CurationAudience,
  /** Package ids the viewer can no longer buy (purchase limit reached). */
  maxedIds?: Set<string>,
): CuratedSplit<T> {
  const set = curation?.enabled ? curation[audience] : null;
  if (!set || set.ids.length === 0) {
    return { isCurated: false, curated: packages, rest: [], recommendedId: null };
  }
  const byId = new Map(packages.map((p) => [p.id, p]));
  const configured = set.ids
    .map((id) => byId.get(id))
    .filter((p): p is T => !!p);
  if (configured.length === 0) {
    return { isCurated: false, curated: packages, rest: [], recommendedId: null };
  }
  const configuredIds = new Set(configured.map((p) => p.id));
  const maxed = maxedIds ?? new Set<string>();

  // Drop curated packages the viewer can't buy again and backfill from the rest,
  // so they always see a full set of *buyable* options ("next option").
  const buyable = configured.filter((p) => !maxed.has(p.id));
  const restPool = packages.filter((p) => !configuredIds.has(p.id));
  const needed = configured.length - buyable.length;
  const backfill =
    needed > 0 ? restPool.filter((p) => !maxed.has(p.id)).slice(0, needed) : [];
  const curated = [...buyable, ...backfill];
  if (curated.length === 0) {
    return { isCurated: false, curated: packages, rest: [], recommendedId: null };
  }
  const shownIds = new Set(curated.map((p) => p.id));
  const rest = packages.filter((p) => !shownIds.has(p.id));
  const recommendedId =
    set.recommendedId && shownIds.has(set.recommendedId) && !maxed.has(set.recommendedId)
      ? set.recommendedId
      : null;
  return { isCurated: true, curated, rest, recommendedId };
}
