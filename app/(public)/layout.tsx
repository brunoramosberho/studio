"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DesktopSidebar } from "@/components/shared/desktop-sidebar";
import { UtmTracker } from "@/components/shared/utm-tracker";

const sidebarPaths = ["/schedule", "/coaches", "/class/", "/book/", "/packages", "/shop"];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const showSidebar =
    !!session?.user && sidebarPaths.some((p) => pathname.startsWith(p));

  const tracker = (
    <Suspense>
      <UtmTracker />
    </Suspense>
  );

  if (showSidebar) {
    return (
      <div className="min-h-dvh bg-background safe-top">
        {tracker}
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
      {tracker}
      <Navbar />
      <main className="min-h-dvh">{children}</main>
      <Footer />
    </>
  );
}
