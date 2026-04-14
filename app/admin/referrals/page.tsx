"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Check, Gift, AlertCircle, Users, TrendingUp } from "lucide-react";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

interface LifecycleItem {
  stage: string;
  count: number;
}

interface TopReferrer {
  id: string;
  name: string | null;
  image: string | null;
  email: string;
  referralCount: number;
  rewardsDelivered: number;
}

interface PendingReward {
  id: string;
  rewardText: string | null;
  type: string;
  createdAt: string;
  member: {
    id: string;
    name: string | null;
    image: string | null;
    email: string;
  };
}

interface MetricsData {
  lifecycleDistribution: LifecycleItem[];
  topReferrers: TopReferrer[];
  pendingRewards: PendingReward[];
}

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  installed: "Instalaron",
  purchased: "Compraron",
  booked: "Reservaron",
  attended: "Asistieron",
  member: "Miembros",
};

const STAGE_DESCRIPTIONS: Record<string, string> = {
  lead: "cuenta creada, sin actividad",
  installed: "descargaron la app",
  purchased: "hicieron una compra",
  booked: "han reservado al menos una vez",
  attended: "han ido al menos una vez",
  member: "membresía activa",
};

export default function AdminReferralsPage() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [delivering, setDelivering] = useState<Set<string>>(new Set());

  const loadData = useCallback(() => {
    fetch("/api/admin/referrals/metrics")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeliverReward = useCallback(
    async (rewardId: string) => {
      setDelivering((prev) => new Set(prev).add(rewardId));
      try {
        const res = await fetch("/api/admin/referrals/rewards", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rewardId, status: "delivered" }),
        });
        if (res.ok) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  pendingRewards: prev.pendingRewards.filter((r) => r.id !== rewardId),
                }
              : prev,
          );
        }
      } catch {
        /* */
      }
      setDelivering((prev) => {
        const next = new Set(prev);
        next.delete(rewardId);
        return next;
      });
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center text-sm text-muted">
        No se pudieron cargar las métricas.
      </div>
    );
  }

  const totalMembers = data.lifecycleDistribution.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...data.lifecycleDistribution.map((d) => d.count), 1);

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Referidos y lifecycle</h1>
        <p className="mt-1 text-sm text-muted">
          Distribución de miembros por etapa y métricas del programa de referidos.
        </p>
      </div>

      {/* Pending manual rewards alert */}
      {data.pendingRewards.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {data.pendingRewards.length} reward{data.pendingRewards.length > 1 ? "s" : ""} manual{data.pendingRewards.length > 1 ? "es" : ""} pendiente{data.pendingRewards.length > 1 ? "s" : ""}
            </p>
            <p className="mt-0.5 text-[13px] text-amber-700">
              Entrega el premio y márcalo como entregado.
            </p>
          </div>
        </div>
      )}

      {/* Lifecycle distribution */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold text-foreground">
            Distribución de lifecycle
          </h2>
          <span className="ml-auto text-[12px] text-muted">{totalMembers} miembros</span>
        </div>
        <div className="space-y-3">
          {data.lifecycleDistribution.map((item) => (
            <div key={item.stage}>
              <div className="mb-1 flex items-baseline justify-between">
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {STAGE_LABELS[item.stage] ?? item.stage}
                  </span>
                  <span className="ml-2 text-[11px] text-muted">
                    {STAGE_DESCRIPTIONS[item.stage]}
                  </span>
                </div>
                <span className="text-sm font-bold text-foreground tabular-nums">
                  {item.count}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Top referrers */}
      <section className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold text-foreground">Top referrers</h2>
        </div>
        {data.topReferrers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Nadie ha referido aún.
          </p>
        ) : (
          <div className="space-y-2">
            {data.topReferrers.map((r, i) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-border/30 px-4 py-3"
              >
                <span className="w-6 text-center text-[13px] font-bold text-muted">
                  {i + 1}
                </span>
                <UserAvatar user={r as UserAvatarUser} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.name ?? r.email}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground tabular-nums">
                    {r.referralCount}
                  </p>
                  <p className="text-[11px] text-muted">
                    {r.rewardsDelivered} entregado{r.rewardsDelivered !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending manual rewards */}
      {data.pendingRewards.length > 0 && (
        <section className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Gift className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-foreground">
              Rewards manuales pendientes
            </h2>
          </div>
          <div className="space-y-2">
            {data.pendingRewards.map((reward) => (
              <div
                key={reward.id}
                className="flex items-center gap-3 rounded-xl border border-border/30 px-4 py-3"
              >
                <UserAvatar user={reward.member as UserAvatarUser} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {reward.member.name ?? reward.member.email}
                  </p>
                  <p className="text-[12px] text-muted">
                    {reward.type === "referrer" ? "Invitó a alguien" : "Fue invitado/a"}
                    {reward.rewardText ? ` — ${reward.rewardText}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleDeliverReward(reward.id)}
                  disabled={delivering.has(reward.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    "bg-green-50 text-green-700 hover:bg-green-100 active:scale-95",
                    delivering.has(reward.id) && "opacity-60",
                  )}
                >
                  {delivering.has(reward.id) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Entregado
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
