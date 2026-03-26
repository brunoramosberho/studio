"use client";

import { useState, useEffect } from "react";
import { MapPin, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

interface DetectLocationResponse {
  countryId: string | null;
  cityId: string | null;
  cityName: string | null;
  countryName: string | null;
  hasStudios: boolean;
}

interface ProfileResponse {
  cityId: string | null;
  countryId: string | null;
}

const DISMISS_KEY = "city-prompt-dismissed";

export function CityDetectPrompt() {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const [show, setShow] = useState(false);
  const [cityName, setCityName] = useState("");
  const [detectedCityId, setDetectedCityId] = useState<string | null>(null);
  const [detectedCountryId, setDetectedCountryId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    let cancelled = false;

    async function detect() {
      try {
        const [geoRes, profileRes] = await Promise.all([
          fetch("/api/detect-location"),
          fetch("/api/profile"),
        ]);

        if (!geoRes.ok || !profileRes.ok || cancelled) return;

        const geo: DetectLocationResponse = await geoRes.json();
        const profile: ProfileResponse = await profileRes.json();

        if (!geo.cityId || !geo.hasStudios) return;
        if (geo.cityId === profile.cityId) return;

        setCityName(geo.cityName ?? "");
        setDetectedCityId(geo.cityId);
        setDetectedCountryId(geo.countryId);
        setShow(true);
      } catch {}
    }

    const timer = setTimeout(detect, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status]);

  function dismiss() {
    setShow(false);
    sessionStorage.setItem(DISMISS_KEY, "1");
  }

  async function accept() {
    setUpdating(true);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityId: detectedCityId,
          countryId: detectedCountryId,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["packages"] });
    } catch {}
    setUpdating(false);
    dismiss();
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
          className="relative mb-4 overflow-hidden rounded-2xl border border-accent/20 bg-accent/5"
        >
          <button
            onClick={dismiss}
            className="absolute right-2 top-2 rounded-full p-1 text-muted/60 transition-colors hover:bg-white/60 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-3 p-4 pr-10">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10">
              <MapPin className="h-4 w-4 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Parece que estás en {cityName}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                ¿Quieres ver las clases y paquetes de esta ciudad?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={accept}
                  disabled={updating}
                  className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-60"
                >
                  {updating ? "Cambiando..." : `Cambiar a ${cityName}`}
                </button>
                <button
                  onClick={dismiss}
                  className="rounded-full px-4 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface"
                >
                  No, gracias
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
