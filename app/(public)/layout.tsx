"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { DesktopSidebar } from "@/components/shared/desktop-sidebar";
import { UtmTracker } from "@/components/shared/utm-tracker";
import { FullNavFallback } from "@/components/shared/full-nav-fallback";
import { useBranding } from "@/components/branding-provider";

const sidebarPaths = [
  "/schedule",
  "/instructors",
  "/class/",
  "/book/",
  "/packages",
  "/shop",
  "/on-demand",
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const showSidebar =
    !!session?.user && sidebarPaths.some((p) => pathname.startsWith(p));

  // A studio can pin its landing to the dark palette. Applied as a class on
  // this subtree rather than on <html>: the theme provider strips a forced
  // class off the document on hydration when the visitor prefers light, and
  // the member app is theirs to set — this is only the shop window.
  const { landingTheme } = useBranding();
  const darkLanding = pathname === "/" && landingTheme === "dark";

  const tracker = (
    <>
      <Suspense>
        <UtmTracker />
      </Suspense>
      {/* Signed-out only: Next's client-side nav silently aborts on the public
          site, so fall back to full-page navigation (see FullNavFallback). */}
      {!session?.user && <FullNavFallback />}
    </>
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
    <div className={darkLanding ? "dark min-h-dvh bg-background" : undefined}>
      {tracker}
      <Navbar />
      <main className="min-h-dvh">{children}</main>
      <Footer />
    </div>
  );
}
