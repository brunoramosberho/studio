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
  | "clients"
  | "feed"
  | "achievements"
  | "pos"
  | "waitlist"
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
  | "waiver"
  | "branding"
  | "team"
  | "studios"
  | "language";

const ALL_PERMISSIONS: AdminPermission[] = [
  "dashboard", "schedule", "classes", "checkIn", "clients",
  "feed", "achievements", "pos", "waitlist",
  "coaches", "availability", "disciplines",
  "finance", "packages", "subscriptions", "shop", "platforms",
  "reports", "analytics", "conversion",
  "marketing", "highlights", "referrals",
  "billing", "waiver", "branding", "team", "studios", "language",
];

const FRONT_DESK_PERMISSIONS: Set<AdminPermission> = new Set([
  "dashboard",
  "schedule",
  "classes",
  "checkIn",
  "clients",
  "feed",
  "achievements",
  "pos",
  "waitlist",
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
