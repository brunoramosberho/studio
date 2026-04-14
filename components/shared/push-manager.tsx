"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Bell, X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useBranding } from "@/components/branding-provider";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushManager() {
  const { data: session } = useSession();
  const { colorAccent: accent } = useBranding();
  const t = useTranslations("push");
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [desktopLayout, setDesktopLayout] = useState(false);

  const subscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await sendSubscriptionToServer(existing);
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      await sendSubscriptionToServer(subscription);
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }, []);

  const handleEnable = useCallback(async () => {
    setShowPrompt(false);
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      await subscribe();
    }
  }, [subscribe]);

  useEffect(() => {
    if (!showPrompt || dismissed) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showPrompt, dismissed]);

  useEffect(() => {
    if (!session?.user || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    navigator.serviceWorker.register("/sw.js").then(async () => {
      const permission = Notification.permission;

      if (permission === "granted") {
        await subscribe();
        return;
      }

      if (permission === "default") {
        const alreadyDismissed = sessionStorage.getItem("push-prompt-dismissed");
        if (!alreadyDismissed) {
          setTimeout(() => {
            setDesktopLayout(window.matchMedia("(min-width: 768px)").matches);
            setShowPrompt(true);
          }, 2800);
        }
      }
    });
  }, [session?.user, subscribe]);

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    sessionStorage.setItem("push-prompt-dismissed", "1");
  };

  if (!showPrompt || dismissed) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:p-4">
          {/* Backdrop: tap to dismiss, blocks interaction with app behind */}
          <motion.button
            type="button"
            aria-label={t("closePrompt")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleDismiss}
            className="absolute inset-0 bg-foreground/50 backdrop-blur-md supports-[backdrop-filter]:bg-foreground/40"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="push-prompt-title"
            aria-describedby="push-prompt-desc"
            initial={
              desktopLayout
                ? { opacity: 0, scale: 0.92, y: 12 }
                : { opacity: 0, y: "100%" }
            }
            animate={
              desktopLayout
                ? { opacity: 1, scale: 1, y: 0 }
                : { opacity: 1, y: 0 }
            }
            exit={
              desktopLayout
                ? { opacity: 0, scale: 0.96, y: 8 }
                : { opacity: 0, y: "100%" }
            }
            transition={{
              type: "spring",
              damping: 32,
              stiffness: 380,
              mass: 0.85,
            }}
            className="relative z-[1] w-full max-w-lg md:max-w-md"
          >
            <div
              className={[
                "relative overflow-hidden border border-border/60 bg-card shadow-[0_-12px_48px_rgba(15,23,42,0.18)]",
                "rounded-t-[1.75rem] pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 md:rounded-3xl md:pb-8 md:pt-8 md:shadow-[var(--shadow-warm-lg)]",
              ].join(" ")}
            >
              {/* Decorative top glow */}
              <div
                className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full opacity-[0.14] blur-3xl"
                style={{ backgroundColor: accent }}
              />

              {/* Mobile drag affordance */}
              <div className="mx-auto mb-2 flex justify-center md:hidden">
                <div className="h-1.5 w-12 rounded-full bg-border" />
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface active:bg-surface md:right-4 md:top-4"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>

              <div className="relative px-5 pt-2 md:px-8 md:pt-2">
                <div className="flex flex-col items-center text-center md:pt-2">
                  <motion.div
                    className="relative mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.35rem] shadow-md md:mb-6 md:h-20 md:w-20 md:rounded-2xl"
                    style={{ backgroundColor: `${accent}18` }}
                    initial={{ scale: 0.85 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.08, stiffness: 400, damping: 22 }}
                  >
                    <motion.div
                      className="absolute inset-0 rounded-[1.35rem] md:rounded-2xl"
                      style={{ border: `2px solid ${accent}33` }}
                      animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.04, 1] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <Bell
                      className="relative z-[1] h-9 w-9 md:h-10 md:w-10"
                      style={{ color: accent }}
                      strokeWidth={2}
                    />
                  </motion.div>

                  <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {t("dontMissOut")}
                    </span>
                  </div>

                  <h2
                    id="push-prompt-title"
                    className="font-display text-[1.35rem] font-bold leading-tight tracking-tight text-foreground md:text-2xl"
                  >
                    {t("enableNotificationsTitle")}
                  </h2>
                  <p
                    id="push-prompt-desc"
                    className="mt-3 max-w-[20rem] text-[15px] leading-relaxed text-muted md:max-w-none md:text-base"
                  >
                    {t("enableNotificationsDesc")}
                  </p>
                </div>

                <div className="mt-7 flex flex-col gap-3 md:mt-8">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={handleEnable}
                    className="flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl px-5 text-[16px] font-bold text-white shadow-lg transition-[box-shadow] active:shadow-md md:min-h-14 md:text-[15px]"
                    style={{
                      backgroundColor: accent,
                      boxShadow: `0 8px 24px ${accent}40`,
                    }}
                  >
                    {t("allowNotifications")}
                  </motion.button>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="min-h-11 w-full rounded-xl py-2.5 text-[15px] font-medium text-muted transition-colors active:bg-surface md:min-h-12"
                  >
                    {t("notNow")}
                  </button>
                </div>

                <p className="mt-4 pb-1 text-center text-[11px] leading-snug text-muted/75 md:mt-5">
                  {t("iphoneHint")}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

async function sendSubscriptionToServer(subscription: PushSubscription) {
  const json = subscription.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    }),
  });
}
