/**
 * Server-side gate for the staff portals.
 *
 * Signing in on the admin portal used to be enough to render the whole
 * dashboard: middleware only checks that an admin cookie exists, and the
 * layout was a client shell with no server check. Every API call underneath
 * did reject the stranger, so no data leaked — but they still landed inside
 * the product, saw the navigation, and could read every section title. Anyone
 * with any email address could do it.
 *
 * These helpers make membership the gate. They deliberately do NOT call
 * `getAuthContext()`, which creates a CLIENT membership on first sight: a
 * stranger poking at /admin should leave no trace behind.
 */

import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { adminAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTenant, roleAtLeast } from "@/lib/tenant";

export type StaffPortal = "admin" | "coach";

const MIN_ROLE: Record<StaffPortal, Role> = {
  // Front desk is the lowest rank with a reason to open /admin; coaches reach
  // their own portal instead.
  admin: "FRONT_DESK",
  coach: "COACH",
};

export interface StaffAccess {
  userId: string;
  tenantId: string;
  role: Role;
}

/**
 * Resolve the signed-in staff member for this portal, or redirect.
 *
 * Redirects rather than throwing so the layout can call it directly: a signed
 * -out visitor goes to the login page, and a signed-in one without the rank
 * gets told plainly instead of staring at an empty dashboard.
 */
export async function requireStaffAccess(portal: StaffPortal): Promise<StaffAccess> {
  const session = await adminAuth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/login?portal=admin&callbackUrl=/${portal}`);

  const tenant = await getTenant();
  if (!tenant) redirect("/");

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId: tenant.id } },
    select: { role: true },
  });

  if (!membership || !roleAtLeast(membership.role, MIN_ROLE[portal])) {
    redirect(`/no-access?portal=${portal}`);
  }

  return { userId, tenantId: tenant.id, role: membership.role };
}

/**
 * Does this email already belong to staff at this tenant?
 *
 * Used to decide whether a magic link for the admin portal is worth sending
 * at all. Staff are always created up front from /admin/team, so "no
 * membership yet" is never a legitimate first-time sign-in here — unlike the
 * client portal, where signing up IS the point.
 */
export async function isStaffEmail(email: string, tenantId: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const membership = await prisma.membership.findFirst({
    where: {
      tenantId,
      role: { in: ["COACH", "FRONT_DESK", "ADMIN"] },
      user: { email: { equals: normalized, mode: "insensitive" } },
    },
    select: { id: true },
  });
  if (membership) return true;

  // Super admins can always reach any tenant's portal — that's how a studio
  // gets bootstrapped before it has any staff of its own.
  const superAdmin = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" }, isSuperAdmin: true },
    select: { id: true },
  });
  return !!superAdmin;
}
