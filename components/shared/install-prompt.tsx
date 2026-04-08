"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { X, Share, Plus, Download, Ellipsis, ChevronDown } from "lucide-react";
import { getMobileInstallPlatform, isStandalonePWA } from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function wasDismissedRecently(): boolean {
  try {
    const ts = localStorage.getItem(DISMISSED_KEY);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
  } catch {
    /* ignore */
  }
}

type Platform = "ios" | "android" | null;

export function InstallPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    markDismissed();
  }, []);

  useEffect(() => {
    if (isStandalonePWA() || wasDismissedRecently() || pathname === "/install") return;

    const plat = getMobileInstallPlatform();
    if (!plat) return;
    setPlatform(plat);

    if (plat === "android") {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setVisible(true);
      };
      window.addEventListener("beforeinstallprompt", handler);

      const timer = setTimeout(() => {
        setVisible(true);
      }, 3000);

      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        clearTimeout(timer);
      };
    }

    if (plat === "ios") {
      const isSafari =
        /Safari/i.test(navigator.userAgent) &&
        !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(navigator.userAgent);
      if (!isSafari) return;

      const timer = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
      }
      setDeferredPrompt(null);
    }
    dismiss();
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[72px] z-[60] mx-auto max-w-sm px-4 md:hidden",
        "animate-in slide-in-from-bottom-4 fade-in duration-500",
      )}
    >
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background shadow-xl shadow-foreground/5">
        <button
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-full p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
              <Download className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Instala la app
              </p>
              <p className="text-xs text-muted">
                Acceso rápido desde tu pantalla
              </p>
            </div>
          </div>

          {platform === "ios" ? (
            <div className="space-y-3">
              <p className="text-[13px] leading-relaxed text-muted">
                Agrégala a tu pantalla de inicio en 3 pasos:
              </p>
              <div className="space-y-0 rounded-xl bg-surface/80 p-3">
                <div className="flex items-center gap-3 pb-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Ellipsis className="h-4 w-4" />
                  </div>
                  <p className="text-[13px] text-foreground">
                    Toca <strong>⋯</strong>{" "}
                    <span className="text-muted">abajo a la derecha</span>
                  </p>
                </div>
                <div className="flex items-center gap-3 border-t border-border/40 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Share className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-[13px] text-foreground">
                    Toca <strong>Compartir</strong>
                  </p>
                </div>
                <div className="flex items-center gap-3 border-t border-border/40 pt-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Plus className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-[13px] text-foreground">
                    Toca <strong>Agregar a Inicio</strong>{" "}
                    <span className="text-muted">
                      <ChevronDown className="mb-0.5 inline h-3 w-3" /> desliza
                      abajo
                    </span>
                  </p>
                </div>
              </div>
              <button
                onClick={dismiss}
                className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
              >
                Entendido
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] leading-relaxed text-muted">
                Instálala como app para reservar clases más rápido.
              </p>
              <button
                onClick={handleInstall}
                className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
              >
                Instalar app
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
