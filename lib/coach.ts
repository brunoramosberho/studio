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
