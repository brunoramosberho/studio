"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  Gift,
  Users,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { useBranding } from "@/components/branding-provider";
import { PageTransition } from "@/components/shared/page-transition";

interface ReferralData {
  code: string;
  shareUrl: string;
  config: {
    isEnabled: boolean;
    referrerRewardText: string | null;
    referrerRewardWhen: string | null;
    refereeRewardText: string | null;
    triggerStage: string;
  } | null;
  stats: { total: number; delivered: number; pending: number };
  referrals: Array<{
    id: string;
    name: string | null;
    image: string | null;
    lifecycleStage: string;
    joinedAt: string;
    rewardStatus: string | null;
    stagesCompleted: string[];
  }>;
}

const LIFECYCLE_STAGES = [
  { key: "lead", label: "Cuenta creada" },
  { key: "installed", label: "App instalada" },
  { key: "purchased", label: "Primera compra" },
  { key: "booked", label: "Primera reserva" },
  { key: "attended", label: "Fue a una clase" },
  { key: "member", label: "Membresía activa" },
];

const TRIGGER_STAGE_LABELS: Record<string, string> = {
  installed: "instale la app",
  purchased: "haga su primera compra",
  booked: "reserve su primera clase",
  attended: "vaya a su primera clase",
  member: "active su membresía",
};

export default function ReferralsPage() {
  const router = useRouter();
  const brand = useBranding();
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/referrals")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  }, [data]);

  const handleShare = useCallback(async () => {
    if (!data || !navigator.share) return;
    try {
      await navigator.share({
        title: `Únete a ${brand.studioName}`,
        text: `Te invito a ${brand.studioName}`,
        url: data.shareUrl,
      });
    } catch {
      /* user cancelled */
    }
  }, [data, brand.studioName]);

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      </PageTransition>
    );
  }

  if (!data || !data.config?.isEnabled) {
    return (
      <PageTransition>
        <div className="pb-24">
          <div className="mb-5 flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-surface"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-display text-xl font-bold text-foreground">
              Invita amigos
            </h1>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card py-12 text-center">
            <span className="text-3xl">🔗</span>
            <p className="mt-3 text-sm font-medium text-foreground">
              El programa de referidos no está activo
            </p>
            <p className="mt-1 text-[13px] text-muted">
              Vuelve pronto
            </p>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="pb-24">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-surface"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl font-bold text-foreground">
            Invita amigos
          </h1>
        </div>

        {/* Stats */}
        <div className="mb-5 grid grid-cols-3 gap-2">
          {[
            { label: "Invitados", value: data.stats.total, icon: Users },
            { label: "Premios", value: data.stats.delivered, icon: Gift },
            { label: "En progreso", value: data.stats.pending, icon: Loader2 },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col items-center rounded-2xl border border-border/50 bg-card py-4"
            >
              <Icon className="mb-1.5 h-4 w-4 text-muted" />
              <span className="text-lg font-bold text-foreground">{value}</span>
              <span className="text-[11px] text-muted">{label}</span>
            </div>
          ))}
        </div>

        {/* Share link */}
        <div className="mb-5 rounded-2xl border border-border/50 bg-card p-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">
            Tu link de invitación
          </p>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-xl bg-surface px-3 py-2.5 font-mono text-[13px] text-foreground">
              {data.shareUrl}
            </div>
            <button
              onClick={handleCopy}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-white active:opacity-80"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                onClick={handleShare}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground active:bg-surface"
                style={{ background: brand.colorAccentSoft, color: brand.colorAccent }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 3v12" />
                  <path d="m8 7 4-4 4 4" />
                  <path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Reward info */}
        {data.config.referrerRewardText && (
          <div className="mb-5 rounded-2xl p-4" style={{ background: "#1C1917" }}>
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">
              Tu recompensa cuando tu amigo/a{" "}
              {TRIGGER_STAGE_LABELS[data.config.triggerStage] ?? "complete el paso"}
            </p>
            <p className="mt-0.5 text-base font-bold text-white">
              {data.config.referrerRewardText}
            </p>
            {data.config.referrerRewardWhen && (
              <p className="mt-0.5 text-[11px] text-white/50">
                {data.config.referrerRewardWhen}
              </p>
            )}
          </div>
        )}

        {/* Referrals list */}
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">
            Tus invitados ({data.referrals.length})
          </h2>

          {data.referrals.length === 0 ? (
            <div className="rounded-2xl border border-border/50 bg-card py-12 text-center">
              <span className="text-3xl">✉️</span>
              <p className="mt-3 text-sm font-medium text-foreground">
                Aún no has invitado a nadie
              </p>
              <p className="mt-1 text-[13px] text-muted">
                Comparte tu link para empezar
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.referrals.map((ref) => {
                const isExpanded = expandedId === ref.id;
                const triggerIndex = LIFECYCLE_STAGES.findIndex(
                  (s) => s.key === data.config!.triggerStage,
                );

                return (
                  <div
                    key={ref.id}
                    className="overflow-hidden rounded-2xl border border-border/50 bg-card"
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : ref.id)}
                      className="flex w-full items-center gap-3 p-4 text-left active:bg-surface/50"
                    >
                      <UserAvatar user={ref as UserAvatarUser} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[15px] font-semibold text-foreground">
                            {ref.name ?? "Sin nombre"}
                          </p>
                          {ref.rewardStatus === "delivered" && (
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                              style={{ background: brand.colorAccent }}
                            >
                              Premio ✓
                            </span>
                          )}
                        </div>
                        {/* Mini progress dots */}
                        <div className="mt-1.5 flex items-center gap-1">
                          {LIFECYCLE_STAGES.slice(0, triggerIndex + 1).map((stage, i) => {
                            const completed = ref.stagesCompleted.includes(stage.key);
                            return (
                              <div key={stage.key} className="flex items-center">
                                {i > 0 && (
                                  <div
                                    className="mx-0.5 h-[2px] w-3"
                                    style={{
                                      background: completed
                                        ? brand.colorAccent
                                        : "#E4E4E7",
                                    }}
                                  />
                                )}
                                <div
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    background: completed
                                      ? brand.colorAccent
                                      : "#E4E4E7",
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border/30 px-4 py-3">
                        <div className="space-y-2">
                          {LIFECYCLE_STAGES.map((stage) => {
                            const completed = ref.stagesCompleted.includes(stage.key);
                            const isTrigger = stage.key === data.config!.triggerStage;
                            return (
                              <div
                                key={stage.key}
                                className="flex items-center gap-2.5 text-[13px]"
                              >
                                <div
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]"
                                  style={{
                                    background: completed
                                      ? brand.colorAccent
                                      : "#F4F4F5",
                                    color: completed ? "#fff" : "#A1A1AA",
                                  }}
                                >
                                  {completed ? "✓" : "·"}
                                </div>
                                <span
                                  className={
                                    completed
                                      ? "font-medium text-foreground"
                                      : "text-muted"
                                  }
                                >
                                  {stage.label}
                                  {isTrigger && (
                                    <span className="ml-1 text-[11px] text-accent">
                                      ← premio
                                    </span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="mt-3 text-[11px] text-muted">
                          Se unió el{" "}
                          {new Date(ref.joinedAt).toLocaleDateString("es", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
