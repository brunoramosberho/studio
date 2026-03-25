"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DesktopSidebar } from "@/components/shared/desktop-sidebar";
import { useTenant } from "@/components/tenant-provider";

const sidebarPaths = ["/schedule", "/coaches", "/class/", "/book/", "/packages"];

const adminRedirects: Record<string, string> = {
  "/schedule": "/admin/schedule",
  "/packages": "/admin/packages",
  "/coaches": "/admin/coaches",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useTenant();

  const isAdmin = role === "ADMIN";

  useEffect(() => {
    if (!isAdmin) return;
    const target = adminRedirects[pathname];
    if (target) router.replace(target);
  }, [isAdmin, pathname, router]);

  const showSidebar =
    !!session?.user && !isAdmin && sidebarPaths.some((p) => pathname.startsWith(p));

  if (showSidebar) {
    return (
      <div className="min-h-dvh bg-background">
        <DesktopSidebar />

        <main className="min-h-dvh pb-24 md:ml-64 md:pb-0">
          <div className="px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <main className="min-h-dvh">{children}</main>
      <Footer />
    </>
  );
}
