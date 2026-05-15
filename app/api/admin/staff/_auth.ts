import { requireRole } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";

// Shared guard for the staff-management admin routes. Requires ADMIN role
// (FRONT_DESK has its own self-service surface; they don't see anyone else's
// pay or timesheets).
export async function requireStaffManagement() {
  const ctx = await requireRole("ADMIN");
  if (!hasPermission(ctx.membership.role, "staffManagement")) {
    throw new Error("Forbidden");
  }
  return ctx;
}
