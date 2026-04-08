"use client";

import { useEffect, useState } from "react";
import { detectDevice, type DeviceInfo } from "@/lib/pwa/detect";
import { useBranding } from "@/components/branding-provider";
import { InstalledScreen } from "@/components/install/installed-screen";
import { IosSafariScreen } from "@/components/install/ios-safari-screen";
import { IosSafariNewScreen } from "@/components/install/ios-safari-new-screen";
import { IosSafariIPadScreen } from "@/components/install/ios-safari-ipad-screen";
import { IosChromeScreen } from "@/components/install/ios-chrome-screen";
import { AndroidScreen } from "@/components/install/android-screen";
import { OtherScreen } from "@/components/install/other-screen";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPage() {
  const brand = useBranding();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setDevice(detectDevice());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!device) return null;

  const screens: Record<DeviceInfo["scenario"], React.ReactNode> = {
    installed: <InstalledScreen brand={brand} />,
    "ios-safari": <IosSafariScreen brand={brand} />,
    "ios-safari-new": <IosSafariNewScreen brand={brand} />,
    "ios-safari-ipad": <IosSafariIPadScreen brand={brand} />,
    "ios-chrome": <IosChromeScreen brand={brand} />,
    android: <AndroidScreen brand={brand} deferredPrompt={deferredPrompt} />,
    other: <OtherScreen brand={brand} />,
  };

  return (
    <div className="flex min-h-dvh flex-col items-center bg-[#F5F0EA]">
      {screens[device.scenario]}
    </div>
  );
}
