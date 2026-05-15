"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, MapPin, Loader2, LogIn, LogOut, AlertCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActiveShift {
  id: string;
  studioId: string;
  studio: { id: string; name: string };
  clockInAt: string;
  clockInDistance: number | null;
}

interface StudioLite {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

interface ActiveShiftResponse {
  shift: ActiveShift | null;
  studios: StudioLite[];
}

interface ClockResponse {
  shift: ActiveShift;
  studio: { id: string; name: string };
  distanceMeters: number;
}

interface ClockError {
  error: string;
  code?: string;
  nearestStudio?: string;
  distanceMeters?: number;
  radiusMeters?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geolocation helpers
// ─────────────────────────────────────────────────────────────────────────────

type GeoResult = { latitude: number; longitude: number; accuracy: number };

function getCurrentPosition(): Promise<GeoResult> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Tu navegador no soporta geolocalización"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        const messages: Record<number, string> = {
          1: "Permite el acceso a tu ubicación para registrar la entrada",
          2: "No pudimos obtener tu ubicación. Intenta de nuevo",
          3: "La búsqueda de ubicación tardó demasiado",
        };
        reject(new Error(messages[err.code] ?? "Error de geolocalización"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );
  });
}

// Pad a 1-2 digit number with a leading zero for HH:MM display.
function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function formatElapsed(sinceIso: string, now: Date) {
  const startMs = new Date(sinceIso).getTime();
  const elapsedSec = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = elapsedSec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget
// ─────────────────────────────────────────────────────────────────────────────

export function StaffClockInWidget() {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraMessage, setExtraMessage] = useState<string | null>(null);

  // Tick once per second when open shift exists (to update HH:MM:SS).
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Role comes from the per-tenant membership, not the global session. The
  // NextAuth session in this app only carries id/email/isSuperAdmin — the
  // tenant role lives in Membership and is exposed via /api/admin/me.
  const roleQuery = useQuery<{ role: string }>({
    queryKey: ["admin", "me-role"],
    queryFn: async () => {
      const res = await fetch("/api/admin/me");
      if (!res.ok) throw new Error("Not admin");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const role = roleQuery.data?.role;
  const canUse = role === "FRONT_DESK" || role === "ADMIN";

  const query = useQuery<ActiveShiftResponse>({
    queryKey: ["staff", "active-shift"],
    queryFn: async () => {
      const res = await fetch("/api/admin/staff/me/active-shift");
      if (!res.ok) throw new Error("Error loading shift");
      return res.json();
    },
    enabled: canUse,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const clockIn = useMutation({
    mutationFn: async () => {
      setError(null);
      setExtraMessage(null);
      setBusy("in");
      const pos = await getCurrentPosition();
      const res = await fetch("/api/admin/staff/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const err = body as ClockError;
        if (err.code === "NO_STUDIO_IN_RANGE") {
          throw new Error(
            `${err.error}. Acércate más al estudio para checar entrada.`,
          );
        }
        throw new Error(err.error ?? "Error al checar entrada");
      }
      return body as ClockResponse;
    },
    onSuccess: (data) => {
      setExtraMessage(
        `Entrada registrada en ${data.studio.name} (${Math.round(data.distanceMeters)}m del centro)`,
      );
      qc.invalidateQueries({ queryKey: ["staff", "active-shift"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error"),
    onSettled: () => setBusy(null),
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      setError(null);
      setExtraMessage(null);
      setBusy("out");
      const pos = await getCurrentPosition();
      const res = await fetch("/api/admin/staff/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const err = body as ClockError;
        throw new Error(err.error ?? "Error al checar salida");
      }
      return body as { durationMinutes: number };
    },
    onSuccess: (data) => {
      const h = Math.floor(data.durationMinutes / 60);
      const m = data.durationMinutes % 60;
      setExtraMessage(`Salida registrada — turno de ${h}h ${m}m`);
      qc.invalidateQueries({ queryKey: ["staff", "active-shift"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error"),
    onSettled: () => setBusy(null),
  });

  // Hide entirely until we know the role, and for non-staff roles.
  if (roleQuery.isLoading || !canUse) return null;
  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Cargando turno…</span>
      </div>
    );
  }

  const shift = query.data?.shift ?? null;
  const isOpen = !!shift;
  const elapsed = shift ? formatElapsed(shift.clockInAt, now) : null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
          isOpen
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-border bg-card",
        )}
      >
        <div className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full",
          isOpen ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground",
        )}>
          <Clock className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          {isOpen ? (
            <>
              <div className="font-medium tabular-nums">{elapsed}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{shift.studio.name}</span>
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">Sin turno abierto</div>
              <div className="text-xs text-muted-foreground">
                Cheka entrada cuando llegues al estudio
              </div>
            </>
          )}
        </div>
        {isOpen ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => clockOut.mutate()}
            disabled={busy !== null}
          >
            {busy === "out" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            <span className="ml-1.5">Salida</span>
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => clockIn.mutate()}
            disabled={busy !== null}
          >
            {busy === "in" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            <span className="ml-1.5">Entrada</span>
          </Button>
        )}
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {extraMessage && !error && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          {extraMessage}
        </div>
      )}
      <Link
        href="/admin/me/timesheet"
        className="flex items-center justify-between rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <span>Ver mis horas y nómina</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
