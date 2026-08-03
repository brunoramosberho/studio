import type { Metadata } from "next";
import { CoachLayoutClient } from "./coach-layout-client";
import { requireStaffAccess } from "@/lib/staff-access";

export const metadata: Metadata = {
  manifest: "/api/manifest?portal=coach",
};

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  await requireStaffAccess("coach");
  return <CoachLayoutClient>{children}</CoachLayoutClient>;
}
