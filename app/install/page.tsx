"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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

interface ReferralData {
  referrer: { firstName: string; lastInitial: string; image: string | null } | null;
  reward: { text: string | null; when: string | null } | null;
}

export default function InstallPage() {
  return (
    <Suspense>
      <InstallPageInner />
    </Suspense>
  );
}

function InstallPageInner() {
  const brand = useBranding();
  const searchParams = useSearchParams();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [referral, setReferral] = useState<ReferralData | null>(null);

  useEffect(() => {
    setDevice(detectDevice());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;

    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem("referral_code", ref);
    localStorage.setItem("referral_expiry", expiry.toString());

    fetch(`/api/referrals/lookup?code=${encodeURIComponent(ref)}`)
      .then((r) => r.json())
      .then((data: ReferralData) => setReferral(data))
      .catch(() => {});
  }, [searchParams]);

  const screens: Record<DeviceInfo["scenario"], React.ReactNode> = {
    installed: <InstalledScreen brand={brand} />,
    "ios-safari": <IosSafariScreen brand={brand} iosVersion={device?.iosVersion ?? null} />,
    "ios-safari-new": <IosSafariNewScreen brand={brand} />,
    "ios-safari-ipad": <IosSafariIPadScreen brand={brand} />,
    "ios-chrome": <IosChromeScreen brand={brand} />,
    android: <AndroidScreen brand={brand} deferredPrompt={deferredPrompt} />,
    other: <OtherScreen brand={brand} />,
  };

  return (
    <div
      className="fixed inset-0 overflow-auto bg-background"
      style={{
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="flex min-h-full flex-col items-center">
        {referral?.referrer && (
          <div className="w-full max-w-sm px-4 pt-6">
            <div className="flex items-center gap-3 rounded-2xl bg-foreground/5 p-3">
              {referral.referrer.image ? (
                <img
                  src={referral.referrer.image}
                  alt=""
                  className="h-11 w-11 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: brand.colorAccent }}
                >
                  {referral.referrer.firstName[0]}
                  {referral.referrer.lastInitial[0] ?? ""}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {referral.referrer.firstName} {referral.referrer.lastInitial}
                </p>
                <p className="text-xs text-muted">
                  te invita a unirte a {brand.studioName}
                </p>
              </div>
            </div>

            {referral.reward?.text && (
              <div className="mt-3 rounded-2xl p-3 px-4" style={{ background: "#1C1917" }}>
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                  Regalo de bienvenida
                </p>
                <p className="mt-0.5 text-base font-bold text-white">
                  {referral.reward.text}
                </p>
                {referral.reward.when && (
                  <p className="mt-0.5 text-[11px] text-white/50">
                    {referral.reward.when}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {device ? screens[device.scenario] : null}
      </div>
    </div>
  );
}
