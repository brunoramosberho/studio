import type { Role } from "@prisma/client";

/**
 * Admin permissions control access to sections of the admin portal.
 * Each nav item and API route maps to one of these permissions.
 */
export type AdminPermission =
  // Operational (front desk can access)
  | "dashboard"
  | "schedule"
  | "classes"
  | "checkIn"
  | "noShowReview"
  | "clients"
  | "feed"
  | "achievements"
  | "pos"
  | "waitlist"
  | "orders"
  // Team management
  | "coaches"
  | "availability"
  | "disciplines"
  // Business
  | "finance"
  | "packages"
  | "subscriptions"
  | "shop"
  | "platforms"
  | "onDemand"
  // Metrics
  | "reports"
  | "analytics"
  | "conversion"
  // Marketing
  | "marketing"
  | "highlights"
  | "referrals"
  // Configuration
  | "billing"
  | "policies"
  | "waiver"
  | "branding"
  | "team"
  | "studios"
  | "language"
  | "embed"
  // Staff management (pay rates, commission rules, payroll reports, edit
  // shifts). ADMIN-only. FRONT_DESK can self-clock-in and view their own
  // timesheet without this permission.
  | "staffManagement";

export const ALL_PERMISSIONS: AdminPermission[] = [
  "dashboard", "schedule", "classes", "checkIn", "noShowReview", "clients",
  "feed", "achievements", "pos", "waitlist", "orders",
  "coaches", "availability", "disciplines",
  "finance", "packages", "subscriptions", "shop", "platforms", "onDemand",
  "reports", "analytics", "conversion",
  "marketing", "highlights", "referrals",
  "billing", "policies", "waiver", "branding", "team", "studios", "language", "embed",
  "staffManagement",
];

// FRONT_DESK is an operational role: day-to-day check-in, POS, client lookup.
// They explicitly cannot see the dashboard (business metrics / revenue mix) or
// any Growth surface — including "achievements", which lives in the Growth
// group and is gamification *configuration*, not operational work. The
// schedule is visible read-only: class creation, editing and cancellation are
// gated to ADMIN at the API layer.
const FRONT_DESK_PERMISSIONS: Set<AdminPermission> = new Set([
  "schedule",
  "classes",
  "checkIn",
  "noShowReview",
  "clients",
  "feed",
  "pos",
  "waitlist",
  "orders",
]);

/**
 * Check if a role has a specific admin permission.
 * ADMIN has all permissions. FRONT_DESK has operational permissions only.
 */
export function hasPermission(role: Role, permission: AdminPermission): boolean {
  if (role === "ADMIN") return true;
  if (role === "FRONT_DESK") return FRONT_DESK_PERMISSIONS.has(permission);
  return false;
}

/**
 * Get all permissions for a given role.
 */
export function getPermissionsForRole(role: Role): AdminPermission[] {
  if (role === "ADMIN") return ALL_PERMISSIONS;
  if (role === "FRONT_DESK") return [...FRONT_DESK_PERMISSIONS];
  return [];
}

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

/** Narrow an unknown override (e.g. Membership.permissions JSON) to a clean
 *  AdminPermission[] — drops anything that isn't a known permission. */
export function parsePermissionOverride(
  override: unknown,
): AdminPermission[] | null {
  if (!Array.isArray(override)) return null;
  return override.filter(
    (p): p is AdminPermission => typeof p === "string" && PERMISSION_SET.has(p),
  );
}

/**
 * The effective permissions for a membership. A non-null `permissions` override
 * (array) wins over the role default — so an ADMIN can be granted "everything
 * minus finance", or a FRONT_DESK can be given extra sections. `null`/invalid
 * falls back to the role's default set (back-compat: existing memberships).
 */
export function getEffectivePermissions(membership: {
  role: Role;
  permissions?: unknown;
}): AdminPermission[] {
  const override = parsePermissionOverride(membership.permissions);
  if (override) return override;
  return getPermissionsForRole(membership.role);
}

/** Membership-aware permission check (honors per-user overrides). */
export function membershipHasPermission(
  membership: { role: Role; permissions?: unknown },
  permission: AdminPermission,
): boolean {
  return getEffectivePermissions(membership).includes(permission);
}
