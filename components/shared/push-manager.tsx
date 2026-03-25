"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

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
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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
          setTimeout(() => setShowPrompt(true), 3000);
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
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-sm rounded-2xl border border-border/50 bg-white p-4 shadow-[var(--shadow-warm-lg)] md:bottom-6"
        >
          <button
            onClick={handleDismiss}
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10">
              <Bell className="h-5 w-5 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">
                Activa las notificaciones
              </p>
              <p className="mt-0.5 text-[13px] text-muted">
                Recibe alertas de clases, amigos y recordatorios.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={handleEnable} className="h-8 text-[12px]">
                  Activar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                  className="h-8 text-[12px] text-muted"
                >
                  Ahora no
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
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
