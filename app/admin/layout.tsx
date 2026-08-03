import type { Metadata } from "next";
import { AdminLayoutClient } from "./admin-layout-client";
import { requireStaffAccess } from "@/lib/staff-access";

export const metadata: Metadata = {
  manifest: "/api/manifest?portal=admin",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Middleware only checks that an admin cookie exists, which any signed-in
  // account has. Membership is what actually decides, so it's checked here —
  // before a single pixel of the dashboard renders.
  await requireStaffAccess("admin");
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
