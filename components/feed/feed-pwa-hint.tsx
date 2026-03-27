"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { X, Share, Plus, Download } from "lucide-react";
import {
  getMobileInstallPlatform,
  isStandalonePWA,
  type MobileInstallPlatform,
} from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const SESSION_HIDE_KEY = "feed-pwa-hint-hidden";

function readSessionHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SESSION_HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

export function FeedPwaHint() {
  const { data: session, status } = useSession();
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<MobileInstallPlatform>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) {
      setShow(false);
      return;
    }
    if (isStandalonePWA()) {
      setShow(false);
      return;
    }
    if (readSessionHidden()) {
      setShow(false);
      return;
    }

    const plat = getMobileInstallPlatform();
    setPlatform(plat);
    if (!plat) {
      setShow(false);
      return;
    }

    setShow(true);

    if (plat !== "android") return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [status, session?.user]);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      sessionStorage.setItem(SESSION_HIDE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const handleAndroidInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") dismiss();
  }, [deferredPrompt, dismiss]);

  if (!show || !platform) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-accent/25 bg-accent/[0.07] p-3.5 md:hidden",
        "animate-in fade-in slide-in-from-top-2 duration-300",
      )}
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-full p-1 text-muted transition-colors hover:bg-white/60 hover:text-foreground"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex gap-3 pr-7">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
          <Download className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              Instala la app en tu pantalla de inicio
            </p>
            <p className="text-[11px] text-muted">
              Acceso rápido como en una app nativa
            </p>
          </div>

          {platform === "ios" ? (
            <div className="space-y-1.5 rounded-xl bg-white/60 px-2.5 py-2 dark:bg-black/10">
              <div className="flex items-center gap-2">
                <Share className="h-3.5 w-3.5 shrink-0 text-accent" />
                <p className="text-[12px] text-foreground">
                  Toca <strong>Compartir</strong>{" "}
                  <span className="text-muted">(cuadrado con flecha)</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Plus className="h-3.5 w-3.5 shrink-0 text-accent" />
                <p className="text-[12px] text-foreground">
                  <strong>Agregar a inicio</strong> o <strong>Add to Home Screen</strong>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[12px] leading-snug text-muted">
                {deferredPrompt
                  ? "Chrome te puede instalar la app con un toque."
                  : "Abre el menú del navegador (⋮) y elige Instalar app o Agregar a la pantalla principal."}
              </p>
              {deferredPrompt ? (
                <button
                  type="button"
                  onClick={handleAndroidInstall}
                  className="w-full rounded-xl bg-accent py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent/90"
                >
                  Instalar app
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
