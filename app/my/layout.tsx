"use client";

import { DesktopSidebar } from "@/components/shared/desktop-sidebar";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <DesktopSidebar />

      <main className="pb-24 md:ml-64 md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
