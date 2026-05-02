/**
 * Centralized coach display helpers.
 * CoachProfile.name is the source of truth; User.name is a fallback for legacy records.
 */

type CoachLike = {
  name: string;
  user?: { name?: string | null } | null;
};

type CoachPhotoLike = {
  photoUrl?: string | null;
  user?: { image?: string | null } | null;
};

export function coachDisplayName(coach: CoachLike): string {
  return coach.name || coach.user?.name || "Coach";
}

export function coachDisplayPhoto(coach: CoachPhotoLike): string | null {
  return coach.photoUrl || coach.user?.image || null;
}

type ClassEndTimeLike = {
  endsAt: Date | string;
};

type CoachVisibilityTenant = {
  hideCoachUntilClassEnds?: boolean | null;
};

export function classHasEnded(cls: ClassEndTimeLike, now: Date = new Date()): boolean {
  const end = cls.endsAt instanceof Date ? cls.endsAt : new Date(cls.endsAt);
  return end.getTime() <= now.getTime();
}

/**
 * Whether the assigned coach should be hidden from a client-facing surface for
 * a given class. Returns false when the tenant flag is off, or when the class
 * has already ended (history + ratings always show the coach). Staff portals
 * (admin/coach) should never call this — they always show the coach.
 */
export function shouldHideCoach(
  tenant: CoachVisibilityTenant | null | undefined,
  cls: ClassEndTimeLike,
  now: Date = new Date(),
): boolean {
  if (!tenant?.hideCoachUntilClassEnds) return false;
  return !classHasEnded(cls, now);
}

/**
 * Returns a sanitized coach object for surfaces where the coach should be
 * hidden. Keeps the shape (id, tenantId) so downstream code that reads
 * `cls.coach.id` for keys/links doesn't crash, but blanks out anything that
 * identifies the person. Use on the server before sending data to the
 * client so the name/photo never reach the browser.
 */
export function redactedCoach<T extends { id: string; tenantId?: string | null; userId?: string | null }>(coach: T): T {
  return {
    ...coach,
    name: "",
    photoUrl: null,
    bio: null,
    specialties: [],
    color: null,
    user: null,
    userId: null,
  } as unknown as T;
}
