"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Coffee, Loader2, CheckCircle2, Clock, X, Building2 } from "lucide-react";
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

const TABS: { value: "active" | "ready" | "done"; label: string; statuses: OrderStatus[] }[] = [
  { value: "active", label: "En preparación", statuses: ["PAID"] },
  { value: "ready", label: "Listas", statuses: ["READY"] },
  { value: "done", label: "Entregadas", statuses: ["PICKED_UP"] },
];

export default function AdminOrdersPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "ready" | "done">("active");
  const [studioFilter, setStudioFilter] = useState<string>("all");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  const statusParam = TABS.find((t) => t.value === tab)?.statuses[0] ?? "PAID";

  const { data: orders = [], isLoading } = useQuery<OrderRow[]>({
    queryKey: ["admin-orders", statusParam, studioFilter],
    queryFn: async () => {
      const qs = new URLSearchParams({ status: statusParam });
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

  const grouped = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const o of orders) {
      const key = o.studio.id;
      const existing = map.get(key);
      if (existing) existing.push(o);
      else map.set(key, [o]);
    }
    return Array.from(map.entries())
      .map(([studioId, list]) => ({
        studio: list[0].studio,
        orders: list,
        studioId,
      }))
      .sort((a, b) => a.studio.name.localeCompare(b.studio.name));
  }, [orders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Órdenes del bar</h1>
        <p className="mt-1 text-sm text-muted">
          Pre-órdenes que los clientes hicieron al reservar su clase.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === t.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

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
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Coffee className="h-10 w-10 text-muted/30" />
            <p className="mt-3 font-display text-base font-semibold text-foreground">
              Nada por aquí
            </p>
            <p className="mt-1 text-xs text-muted">
              Cuando un cliente pre-ordene un producto al reservar, aparecerá en esta lista.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.studioId} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Building2 className="h-4 w-4 text-muted" />
                <p className="text-sm font-semibold text-foreground">{g.studio.name}</p>
                <Badge variant="secondary" className="text-[10px]">
                  {g.orders.length}
                </Badge>
              </div>
              <div className="space-y-3">
                {g.orders.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    nowMs={nowMs}
                    onAdvance={(status) => updateMut.mutate({ id: o.id, status })}
                    busy={updateMut.isPending}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
  const ready = order.status === "READY";
  const done = order.status === "PICKED_UP";

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className={cn(
          "rounded-2xl",
          ready && "border-emerald-200 bg-emerald-50/50",
          done && "opacity-70",
        )}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold text-foreground">
                {order.user.name ?? order.user.email}
              </p>
              <p className="text-[11px] text-muted">
                {order.booking.class.classType.name} · {formatTime(order.booking.class.startsAt)}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
                <Clock className="h-3 w-3" />
                {done
                  ? "Entregado"
                  : minutesUntil <= 0
                    ? "Listo para entregar"
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

          {!done && (
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
