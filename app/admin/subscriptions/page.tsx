"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  CalendarSync,
  Loader2,
  Pause,
  Play,
  XCircle,
  User,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatCurrency } from "@/lib/utils";

interface SubData {
  id: string;
  stripeSubscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  pausedAt: string | null;
  resumesAt: string | null;
  canceledAt: string | null;
  user: { id: string; name: string | null; email: string; image: string | null };
  package: {
    id: string;
    name: string;
    price: number;
    currency: string;
    recurringInterval: string | null;
  };
}

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "secondary" | "danger" }> = {
  active: { label: "Activa", variant: "success" },
  past_due: { label: "Pago pendiente", variant: "warning" },
  paused: { label: "Pausada", variant: "secondary" },
  canceled: { label: "Cancelada", variant: "danger" },
  trialing: { label: "Prueba", variant: "secondary" },
  incomplete: { label: "Incompleta", variant: "warning" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function AdminSubscriptionsPage() {
  const queryClient = useQueryClient();
  const [pauseDialog, setPauseDialog] = useState<SubData | null>(null);
  const [pauseDays, setPauseDays] = useState("14");

  const { data: subs = [], isLoading } = useQuery<SubData[]>({
    queryKey: ["admin", "subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/subscriptions");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      subscriptionId,
      action,
      resumesAt,
    }: {
      subscriptionId: string;
      action: "pause" | "resume" | "cancel";
      resumesAt?: string;
    }) => {
      const res = await fetch("/api/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, action, resumesAt }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      toast.success("Suscripción actualizada");
      setPauseDialog(null);
    },
    onError: () => toast.error("Error al actualizar"),
  });

  function handlePause(sub: SubData) {
    const days = parseInt(pauseDays, 10) || 14;
    const resumesAt = new Date(
      Date.now() + days * 24 * 60 * 60 * 1000,
    ).toISOString();
    actionMutation.mutate({
      subscriptionId: sub.stripeSubscriptionId,
      action: "pause",
      resumesAt,
    });
  }

  const active = subs.filter((s) => !["canceled"].includes(s.status));
  const canceled = subs.filter((s) => s.status === "canceled");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Suscripciones
        </h1>
        <p className="mt-1 text-sm text-muted">
          Gestiona las suscripciones recurrentes de tus miembros
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : subs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CalendarSync className="h-10 w-10 text-muted/30" />
            <p className="mt-4 font-medium text-foreground">
              Sin suscripciones activas
            </p>
            <p className="mt-1 text-sm text-muted">
              Cuando un miembro se suscriba a un plan recurrente, aparecerá aquí
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <motion.div
              className="space-y-3"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.05 } } }}
            >
              {active.map((sub) => (
                <motion.div key={sub.id} variants={fadeUp}>
                  <SubCard
                    sub={sub}
                    onPause={() => setPauseDialog(sub)}
                    onResume={() =>
                      actionMutation.mutate({
                        subscriptionId: sub.stripeSubscriptionId,
                        action: "resume",
                      })
                    }
                    onCancel={() =>
                      actionMutation.mutate({
                        subscriptionId: sub.stripeSubscriptionId,
                        action: "cancel",
                      })
                    }
                    loading={actionMutation.isPending}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}

          {canceled.length > 0 && (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                Canceladas
              </p>
              <div className="space-y-3 opacity-60">
                {canceled.map((sub) => (
                  <SubCard key={sub.id} sub={sub} loading={false} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Pause dialog */}
      <Dialog
        open={!!pauseDialog}
        onOpenChange={(o) => !o && setPauseDialog(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pausar suscripción</DialogTitle>
          </DialogHeader>
          {pauseDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                {pauseDialog.user.name} — {pauseDialog.package.name}
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  Días de pausa
                </label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={pauseDays}
                  onChange={(e) => setPauseDays(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted">
                  Se reanudará automáticamente después
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPauseDialog(null)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  disabled={actionMutation.isPending}
                  onClick={() => handlePause(pauseDialog)}
                >
                  {actionMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Pause className="mr-2 h-4 w-4" />
                  )}
                  Pausar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubCard({
  sub,
  onPause,
  onResume,
  onCancel,
  loading,
}: {
  sub: SubData;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  loading: boolean;
}) {
  const badge = STATUS_BADGE[sub.status] ?? {
    label: sub.status,
    variant: "secondary" as const,
  };

  const periodEnd = new Date(sub.currentPeriodEnd).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <Avatar className="h-10 w-10">
          {sub.user.image && <AvatarImage src={sub.user.image} />}
          <AvatarFallback>
            {(sub.user.name ?? sub.user.email).charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {sub.user.name ?? sub.user.email}
            </p>
            <Badge variant={badge.variant} className="shrink-0 text-[10px]">
              {badge.label}
            </Badge>
            {sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
              <Badge variant="warning" className="shrink-0 text-[10px]">
                Cancela {periodEnd}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {sub.package.name} · {formatCurrency(sub.package.price, sub.package.currency)}/{sub.package.recurringInterval === "year" ? "año" : "mes"}
          </p>
          {sub.status === "paused" && sub.resumesAt && (
            <p className="mt-0.5 text-[11px] text-amber-600">
              Reanuda{" "}
              {new Date(sub.resumesAt).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
              })}
            </p>
          )}
        </div>

        {sub.status !== "canceled" && (
          <div className="flex shrink-0 gap-1">
            {sub.status === "paused" ? (
              <Button
                variant="ghost"
                size="icon"
                disabled={loading}
                onClick={onResume}
                title="Reanudar"
              >
                <Play className="h-4 w-4" />
              </Button>
            ) : sub.status === "active" || sub.status === "past_due" ? (
              <Button
                variant="ghost"
                size="icon"
                disabled={loading}
                onClick={onPause}
                title="Pausar"
              >
                <Pause className="h-4 w-4" />
              </Button>
            ) : null}
            {!sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
              <Button
                variant="ghost"
                size="icon"
                disabled={loading}
                onClick={onCancel}
                title="Cancelar inmediatamente"
                className="text-destructive hover:text-destructive"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
