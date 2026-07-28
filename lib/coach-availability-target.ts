import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/tenant";

/**
 * Resolve which coach's calendar an availability request operates on.
 * Defaults to the caller; an ADMIN may pass another coach's userId
 * (validated against this tenant's CoachProfiles) to view or edit the
 * calendar on their behalf — e.g. when the coach never set it up.
 */
export async function resolveTargetCoachUserId(args: {
  sessionUserId: string;
  role: Role;
  tenantId: string;
  requested?: string | null;
}): Promise<
  | { ok: true; coachUserId: string; actingOnBehalf: boolean }
  | { ok: false; status: number; error: string }
> {
  const requested = args.requested?.trim();
  if (!requested || requested === args.sessionUserId) {
    return { ok: true, coachUserId: args.sessionUserId, actingOnBehalf: false };
  }
  if (!roleAtLeast(args.role, "ADMIN")) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const target = await prisma.coachProfile.findFirst({
    where: { tenantId: args.tenantId, userId: requested },
    select: { id: true },
  });
  if (!target) {
    return { ok: false, status: 404, error: "Instructor no encontrado" };
  }
  return { ok: true, coachUserId: requested, actingOnBehalf: true };
}
