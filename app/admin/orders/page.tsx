"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Coffee,
  Loader2,
  CheckCircle2,
  Clock,
  X,
  Building2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Bell,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatTime } from "@/lib/utils";

type OrderStatus = "PENDING_PAYMENT" | "PAID" | "READY" | "PICKED_UP" | "CANCELLED";

interface OrderRow {
  id: string;
  status: OrderStatus;
  pickupAt: string;
  subtotalCents: number;
  currency: string;
  notes: string | null;
  user: { id: string; name: string | null; email: string };
  studio: { id: string; name: string };
  items: { id: string; nameSnapshot: string; quantity: number }[];
  booking: {
    id: string;
    class: {
      startsAt: string;
      endsAt: string;
      classType: { name: string };
    };
  };
}

// Minutes-to-pickup thresholds for visual urgency bands.
const URGENT_MIN = 10;
const SOON_MIN = 30;

// localStorage key for the studio filter. Persists per-browser so a barista
// at one location doesn't have to re-pick their studio on every page load.
// Not synced across devices on purpose — it's a UI preference, not auth.
const STUDIO_FILTER_STORAGE_KEY = "admin-orders:studio-filter";

function urgencyOf(pickupAt: string, nowMs: number): "overdue" | "urgent" | "soon" | "later" {
  const minutes = (new Date(pickupAt).getTime() - nowMs) / 60_000;
  if (minutes <= 0) return "overdue";
  if (minutes <= URGENT_MIN) return "urgent";
  if (minutes <= SOON_MIN) return "soon";
  return "later";
}

export default function AdminOrdersPage() {
  const qc = useQueryClient();
  const [studioFilter, setStudioFilter] = useState<string>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Hydrate the studio filter from localStorage after mount (skipped during
  // SSR to avoid hydration mismatch).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(STUDIO_FILTER_STORAGE_KEY);
      if (saved) setStudioFilter(saved);
    } catch {
      // Private mode / disabled storage — ignore and keep the default.
    }
  }, []);

  // Persist on change so the barista's last-used studio sticks across reloads.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STUDIO_FILTER_STORAGE_KEY, studioFilter);
    } catch {
      // Quota exceeded / storage disabled — silently ignore.
    }
  }, [studioFilter]);

  const { data: studios = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["admin-studios-min"],
    queryFn: async () => {
      const res = await fetch("/api/studios");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data)
        ? data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))
        : [];
    },
  });

  // If the saved studio was deleted or the user lost access to it, fall back
  // to "all" so we don't show an empty list with no obvious cause.
  useEffect(() => {
    if (studioFilter === "all") return;
    if (studios.length === 0) return;
    if (!studios.some((s) => s.id === studioFilter)) setStudioFilter("all");
  }, [studios, studioFilter]);

  const { data: orders = [], isLoading } = useQuery<OrderRow[]>({
    queryKey: ["admin-orders", studioFilter],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (studioFilter !== "all") qs.set("studioId", studioFilter);
      const res = await fetch(`/api/admin/orders?${qs.toString()}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
  });

  const { ready, active, completed, urgentCount } = useMemo(() => {
    const ready: OrderRow[] = [];
    const active: OrderRow[] = [];
    const completed: OrderRow[] = [];
    let urgentCount = 0;

    for (const o of orders) {
      if (o.status === "READY") ready.push(o);
      else if (o.status === "PAID") {
        active.push(o);
        const u = urgencyOf(o.pickupAt, nowMs);
        if (u === "overdue" || u === "urgent") urgentCount++;
      } else if (o.status === "PICKED_UP" || o.status === "CANCELLED") {
        completed.push(o);
      }
    }

    // Active sorted by pickupAt ascending (soonest first).
    active.sort((a, b) => new Date(a.pickupAt).getTime() - new Date(b.pickupAt).getTime());
    // Ready also by pickupAt; oldest first (likely the ones a client is about to pick up).
    ready.sort((a, b) => new Date(a.pickupAt).getTime() - new Date(b.pickupAt).getTime());
    // Completed by most-recent first.
    completed.sort(
      (a, b) => new Date(b.pickupAt).getTime() - new Date(a.pickupAt).getTime(),
    );

    return { ready, active, completed, urgentCount };
  }, [orders, nowMs]);

  const totalActive = ready.length + active.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Órdenes del bar</h1>
        <p className="mt-1 text-sm text-muted">
          Pre-órdenes que los clientes hicieron al reservar su clase.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {studios.length > 1 && (
          <select
            className="h-9 rounded-full border border-border bg-card px-3 text-xs"
            value={studioFilter}
            onChange={(e) => setStudioFilter(e.target.value)}
          >
            <option value="all">Todos los estudios</option>
            {studios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {urgentCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {urgentCount} urgente{urgentCount === 1 ? "" : "s"}
          </span>
        )}

        <span className="ml-auto text-xs text-muted">
          {totalActive} activa{totalActive === 1 ? "" : "s"} · {completed.length} hoy
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : totalActive === 0 && completed.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Coffee className="h-10 w-10 text-muted/30" />
            <p className="mt-3 font-display text-base font-semibold text-foreground">
              Nada por aquí
            </p>
            <p className="mt-1 text-xs text-muted">
              Cuando un cliente pre-ordene un producto al reservar, aparecerá aquí.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Listas para entregar — first because clients can arrive any moment */}
          {ready.length > 0 && (
            <Section
              icon={<Bell className="h-4 w-4 text-emerald-700" />}
              title="Listas para entregar"
              count={ready.length}
              tone="ready"
            >
              {ready.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  nowMs={nowMs}
                  onAdvance={(status) => updateMut.mutate({ id: o.id, status })}
                  busy={updateMut.isPending}
                />
              ))}
            </Section>
          )}

          {/* En preparación */}
          {active.length > 0 && (
            <Section
              icon={<Coffee className="h-4 w-4 text-foreground/70" />}
              title="En preparación"
              count={active.length}
            >
              {active.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  nowMs={nowMs}
                  onAdvance={(status) => updateMut.mutate({ id: o.id, status })}
                  busy={updateMut.isPending}
                />
              ))}
            </Section>
          )}

          {/* Completadas hoy — collapsible */}
          {completed.length > 0 && (
            <div className="space-y-3">
              <button
                onClick={() => setShowCompleted((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted transition-colors hover:bg-surface"
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Completadas hoy
                  <Badge variant="secondary" className="text-[10px]">
                    {completed.length}
                  </Badge>
                </span>
                {showCompleted ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              <AnimatePresence initial={false}>
                {showCompleted && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3">
                      {completed.map((o) => (
                        <OrderCard
                          key={o.id}
                          order={o}
                          nowMs={nowMs}
                          onAdvance={(status) => updateMut.mutate({ id: o.id, status })}
                          busy={updateMut.isPending}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone?: "ready";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex items-center gap-2 px-1",
          tone === "ready" && "text-emerald-700",
        )}
      >
        {icon}
        <p
          className={cn(
            "text-sm font-semibold",
            tone === "ready" ? "text-emerald-800" : "text-foreground",
          )}
        >
          {title}
        </p>
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px]",
            tone === "ready" && "bg-emerald-100 text-emerald-800",
          )}
        >
          {count}
        </Badge>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function OrderCard({
  order,
  nowMs,
  onAdvance,
  busy,
}: {
  order: OrderRow;
  nowMs: number;
  onAdvance: (status: OrderStatus) => void;
  busy: boolean;
}) {
  const pickupAt = new Date(order.pickupAt);
  const minutesUntil = Math.round((pickupAt.getTime() - nowMs) / 60_000);
  const urgency = urgencyOf(order.pickupAt, nowMs);

  const isReady = order.status === "READY";
  const isPickedUp = order.status === "PICKED_UP";
  const isCancelled = order.status === "CANCELLED";
  const isDone = isPickedUp || isCancelled;

  // Visual band on the left edge to make urgency scannable across the column.
  const accentBar = isReady
    ? "bg-emerald-500"
    : isCancelled
      ? "bg-zinc-300"
      : urgency === "overdue"
        ? "bg-red-500"
        : urgency === "urgent"
          ? "bg-amber-500"
          : urgency === "soon"
            ? "bg-yellow-300"
            : "bg-zinc-200";

  const containerTone = isReady
    ? "border-emerald-200 bg-emerald-50/40"
    : urgency === "overdue" && order.status === "PAID"
      ? "border-red-200 bg-red-50/30"
      : urgency === "urgent" && order.status === "PAID"
        ? "border-amber-200 bg-amber-50/30"
        : "";

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className={cn(
          "relative overflow-hidden rounded-2xl",
          containerTone,
          isDone && "opacity-60",
        )}
      >
        <span className={cn("absolute inset-y-0 left-0 w-1.5", accentBar)} aria-hidden />
        <CardContent className="space-y-3 p-4 pl-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold text-foreground">
                {order.user.name ?? order.user.email}
              </p>
              <p className="text-[11px] text-muted">
                {order.booking.class.classType.name} · {formatTime(order.booking.class.startsAt)}{" "}
                · <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{order.studio.name}</span>
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-semibold",
                  isReady
                    ? "text-emerald-700"
                    : urgency === "overdue" && order.status === "PAID"
                      ? "text-red-700"
                      : urgency === "urgent" && order.status === "PAID"
                        ? "text-amber-700"
                        : "text-muted",
                )}
              >
                <Clock className="h-3 w-3" />
                {isPickedUp
                  ? "Entregado"
                  : isCancelled
                    ? "Cancelado"
                    : isReady
                      ? "Listo"
                      : minutesUntil <= 0
                        ? `Atrasado ${Math.abs(minutesUntil)} min`
                        : `en ${minutesUntil} min`}
              </span>
              <p className="mt-0.5 font-mono text-[11px] text-muted">
                {formatTime(order.pickupAt)}
              </p>
            </div>
          </div>

          <ul className="space-y-1 rounded-xl bg-surface/40 p-3 text-sm">
            {order.items.map((it) => (
              <li key={it.id} className="flex justify-between gap-2">
                <span>
                  <span className="font-semibold tabular-nums">{it.quantity}×</span>{" "}
                  {it.nameSnapshot}
                </span>
              </li>
            ))}
          </ul>

          {order.notes && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              📝 {order.notes}
            </p>
          )}

          {!isDone && (
            <div className="flex gap-2">
              {order.status === "PAID" && (
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => onAdvance("READY")}
                >
                  {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Marcar lista
                </Button>
              )}
              {order.status === "READY" && (
                <Button
                  size="sm"
                  className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={busy}
                  onClick={() => onAdvance("PICKED_UP")}
                >
                  {busy ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  )}
                  Entregada
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                disabled={busy}
                onClick={() => {
                  if (confirm("¿Cancelar esta orden?")) onAdvance("CANCELLED");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
