"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DesktopSidebar } from "@/components/shared/desktop-sidebar";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as Record<string, unknown> | undefined)?.role;

  useEffect(() => {
    if (role === "ADMIN") {
      router.replace("/admin");
    }
  }, [role, router]);

  if (role === "ADMIN") return null;

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
