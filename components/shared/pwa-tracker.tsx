"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { isStandalonePWA } from "@/lib/pwa-install";

const REPORTED_KEY = "pwa-install-reported";

export function PwaTracker() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user || !isStandalonePWA()) return;
    if (sessionStorage.getItem(REPORTED_KEY)) return;

    sessionStorage.setItem(REPORTED_KEY, "1");

    fetch("/api/pwa/installed", { method: "POST" }).catch(() => {});
  }, [session?.user]);

  return null;
}
