import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MyLayoutClient } from "./my-layout-client";
import { auth, adminAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

export const metadata: Metadata = {
  manifest: "/api/manifest?portal=my",
};

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  // Staff (ADMIN, FRONT_DESK) of this tenant must never land on the client
  // surface. Bounce them to /admin — the admin layout gates on the admin
  // cookie and routes to /login?portal=admin if they need to sign in there.
  // Read the membership directly so we don't trigger ensureMembership's
  // auto-create-CLIENT side effect on this passthrough.
  const tenant = await getTenant();
  if (tenant) {
    const clientSession = await auth();
    let userId = clientSession?.user?.id;
    if (!userId) {
      const adminSession = await adminAuth();
      userId = adminSession?.user?.id;
    }
    if (userId) {
      const membership = await prisma.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId: tenant.id } },
        select: { role: true },
      });
      if (membership?.role === "ADMIN" || membership?.role === "FRONT_DESK") {
        redirect("/admin");
      }
    }
  }
  return <MyLayoutClient>{children}</MyLayoutClient>;
}
