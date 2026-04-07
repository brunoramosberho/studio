"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DesktopSidebar } from "@/components/shared/desktop-sidebar";
import { PushManager } from "@/components/shared/push-manager";
import { PwaTracker } from "@/components/shared/pwa-tracker";
import { CityDetectPrompt } from "@/components/shared/city-detect-prompt";
export function MyLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") return null;

  return (
    <div className="min-h-dvh bg-background">
      <DesktopSidebar />

      <main className="pb-24 md:ml-64 md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          <CityDetectPrompt />
          {children}
        </div>
      </main>
      <PushManager />
      <PwaTracker />
    </div>
  );
}
