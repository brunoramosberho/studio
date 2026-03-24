"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DesktopSidebar } from "@/components/shared/desktop-sidebar";

const sidebarPaths = ["/schedule", "/coaches", "/class/", "/book/", "/packages"];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const showSidebar =
    !!session?.user && sidebarPaths.some((p) => pathname.startsWith(p));

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
