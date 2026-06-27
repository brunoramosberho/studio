import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { AdminDashboard } from "./dashboard-client";

// The admin landing is the business dashboard. FRONT_DESK does not have the
// "dashboard" permission (it contains revenue mix, lifecycle funnel, etc.),
// so they land on check-in instead — their first daily task.
export default async function AdminHomePage() {
  const ctx = await getAuthContext();
  if (ctx && !hasPermission(ctx.membership.role, "dashboard")) {
    redirect("/admin/check-in");
  }
  return <AdminDashboard />;
}
