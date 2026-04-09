"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Layers,
  Medal,
  Gift,
  Loader2,
  ChevronDown,
  ChevronUp,
  Save,
  Sparkles,
  Pencil,
  Check,
  X,
  Clock,
  Plus,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Types ── */

interface LevelRow {
  id: string;
  sortOrder: number;
  name: string;
  minClasses: number;
  icon: string;
  color: string;
  rewardOnUnlock: unknown;
}

interface AchievementRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  triggerType: string;
  triggerValue: number | null;
  rewardType: string;
  active: boolean;
}

interface AutoRewardEntry {
  achievementKey: string;
  rewardText: string;
}

interface GamificationConfig {
  levelsEnabled: boolean;
  achievementsEnabled: boolean;
  autoRewardsEnabled: boolean;
  levelOverrides: Record<string, { name?: string; minClasses?: number }>;
  achievementOverrides: Record<string, { enabled?: boolean; name?: string; icon?: string }>;
  autoRewards: AutoRewardEntry[];
}

interface RecentAchievementRow {
  id: string;
  earnedAt: string;
  rewardApplied: boolean;
  user: { id: string; name: string | null; email: string; image: string | null };
  achievement: { key: string; name: string; icon: string; description: string | null };
  rewards: { kind: string; data: Record<string, unknown> }[];
}

interface GamificationOverview {
  loyaltyLevels: LevelRow[];
  systemAchievements: AchievementRow[];
  config: GamificationConfig;
  recentAchievements: RecentAchievementRow[];
  stats: {
    clientsWithProgress: number;
    totalMemberAchievements: number;
  };
}

/* ── Helpers ── */

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

function categoryLabel(c: string) {
  const map: Record<string, string> = {
    MILESTONE: "Hito",
    STREAK: "Racha",
    BIRTHDAY: "Cumpleaños",
    SOCIAL: "Social",
    CUSTOM: "Personalizado",
  };
  return map[c] ?? c;
}

function triggerLabel(t: string) {
  const map: Record<string, string> = {
    CLASS_COUNT: "Nº de clases",
    STREAK_DAYS: "Días de racha",
    BIRTHDAY: "Cumpleaños",
    MANUAL: "Manual / admin",
    REFERRAL: "Referido",
    FIRST_7AM_CLASS: "Primera clase 7am",
    FIRST_9PM_CLASS: "Primera clase 21h",
    FIVE_CLASSES_ONE_WEEK: "5 clases en una semana",
    FIRST_CLASS_OF_TYPE: "Primera clase de tipo",
    WEEKLY_STREAK: "Semanas en racha",
    CLASS_VARIETY: "Variedad de clases",
    COMEBACK: "Regreso tras ausencia",
    CLASSES_IN_WEEK: "Clases en una semana",
  };
  return map[t] ?? t;
}

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

/* ── Toggle switch ── */
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin/50",
        checked ? "bg-admin" : "bg-border",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

/* ── Section wrapper ── */
function Section({
  icon: Icon,
  title,
  count,
  badge,
  children,
  defaultOpen = true,
}: {
  icon: typeof Trophy;
  title: string;
  count?: number;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between rounded-xl border border-border/50 bg-white px-4 py-3 text-left transition-colors hover:bg-surface/60"
      >
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <Icon className="h-4 w-4 text-admin" />
          {title}
          {count !== undefined && (
            <Badge variant="secondary" className="text-[10px]">
              {count}
            </Badge>
          )}
        </span>
        <div className="flex items-center gap-2">
          {badge}
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted" />
          )}
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ═══  PAGE                                  ═══ */
/* ═══════════════════════════════════════════════ */

export default function AdminGamificationPage() {
  const queryClient = useQueryClient();

  /* ── Data ── */
  const { data: overview, isLoading } = useQuery<GamificationOverview>({
    queryKey: ["admin", "gamification"],
    queryFn: async () => {
      const res = await fetch("/api/admin/gamification");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  /* ── Local config state ── */
  const [localConfig, setLocalConfig] = useState<GamificationConfig | null>(null);

  const config = localConfig ?? overview?.config ?? null;
  const setConfig = useCallback(
    (fn: (prev: GamificationConfig) => GamificationConfig) => {
      setLocalConfig((prev) => {
        const base = prev ?? overview?.config ?? {
          levelsEnabled: true,
          achievementsEnabled: true,
          autoRewardsEnabled: false,
          levelOverrides: {},
          achievementOverrides: {},
          autoRewards: [],
        };
        return fn(base);
      });
    },
    [overview?.config],
  );

  const dirty = localConfig !== null;

  /* ── Save mutation ── */
  const saveMutation = useMutation({
    mutationFn: async (cfg: GamificationConfig) => {
      const res = await fetch("/api/admin/gamification", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "gamification"] });
      setLocalConfig(null);
      toast.success("Configuración guardada");
    },
    onError: () => toast.error("Error al guardar"),
  });

  /* ── Prize dialog state ── */
  const [prizeDialog, setPrizeDialog] = useState<RecentAchievementRow | null>(null);
  const [prizeText, setPrizeText] = useState("");

  const grantPrizeMutation = useMutation({
    mutationFn: async ({
      userId,
      achievementKey,
      rewardText,
    }: {
      userId: string;
      achievementKey: string;
      rewardText: string;
    }) => {
      const res = await fetch("/api/admin/gamification/prize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, achievementKey, rewardText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "gamification"] });
      toast.success("Premio otorgado");
      setPrizeDialog(null);
      setPrizeText("");
    },
    onError: (err: Error) => toast.error(err.message || "Error al otorgar premio"),
  });

  /* ── Editing states ── */
  const [editingLevel, setEditingLevel] = useState<string | null>(null);
  const [editingAch, setEditingAch] = useState<string | null>(null);

  /* ── Derived data ── */
  const levels = overview?.loyaltyLevels ?? [];
  const achievements = overview?.systemAchievements ?? [];

  const achievementsByCategory = useMemo(() => {
    const cats: Record<string, AchievementRow[]> = {};
    for (const a of achievements) {
      (cats[a.category] ??= []).push(a);
    }
    return cats;
  }, [achievements]);

  const getAchOverride = useCallback(
    (key: string) => config?.achievementOverrides?.[key] ?? {},
    [config],
  );

  const isAchEnabled = useCallback(
    (key: string) => getAchOverride(key).enabled !== false,
    [getAchOverride],
  );

  const getLevelOverride = useCallback(
    (sortOrder: number) => config?.levelOverrides?.[String(sortOrder)] ?? {},
    [config],
  );

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-0">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!overview || !config) return null;

  const enabledAchCount = achievements.filter((a) => isAchEnabled(a.key)).length;
  const recentAch = overview.recentAchievements;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-24">
      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Logros y premios</h1>
        <p className="mt-1 text-sm text-muted">
          Personaliza niveles, logros y premios para tus clientes.
        </p>
      </motion.div>

      {/* ── Stats ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card className="border-admin/10">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-admin/10">
              <Layers className="h-5 w-5 text-admin" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{levels.length}</p>
              <p className="text-xs text-muted">Niveles</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-admin/10">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-admin/10">
              <Medal className="h-5 w-5 text-admin" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{enabledAchCount}</p>
              <p className="text-xs text-muted">Logros activos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-admin/10">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-admin/10">
              <Gift className="h-5 w-5 text-admin" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{overview.stats.totalMemberAchievements}</p>
              <p className="text-xs text-muted">Desbloqueos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-admin/10">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-admin/10">
              <Clock className="h-5 w-5 text-admin" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{recentAch.length}</p>
              <p className="text-xs text-muted">Últimos 7 días</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ══════════ LEVELS ══════════ */}
      <Section
        icon={Layers}
        title="Niveles de lealtad"
        count={levels.length}
        badge={
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-[11px] text-muted">{config.levelsEnabled ? "Activo" : "Desactivado"}</span>
            <Toggle
              checked={config.levelsEnabled}
              onChange={(v) =>
                setConfig((c) => ({ ...c, levelsEnabled: v }))
              }
            />
          </div>
        }
      >
        <div
          className={cn(
            "space-y-2 rounded-xl border border-border/50 bg-white p-4 transition-opacity",
            !config.levelsEnabled && "opacity-50 pointer-events-none",
          )}
        >
          <p className="mb-3 text-xs text-muted">
            Personaliza el nombre y el número de clases necesarias para cada nivel. Los cambios aplican solo a tu estudio.
          </p>
          {levels.map((l) => {
            const ovr = getLevelOverride(l.sortOrder);
            const displayName = ovr.name ?? l.name;
            const displayMin = ovr.minClasses ?? l.minClasses;
            const isEditing = editingLevel === l.id;

            return (
              <div
                key={l.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5 sm:flex-nowrap"
              >
                <span className="text-xl">{l.icon}</span>
                {isEditing ? (
                  <>
                    <Input
                      className="h-8 w-32 text-sm"
                      defaultValue={displayName}
                      id={`level-name-${l.id}`}
                      placeholder="Nombre"
                    />
                    <Input
                      className="h-8 w-24 text-sm"
                      type="number"
                      min={0}
                      defaultValue={displayMin}
                      id={`level-min-${l.id}`}
                      placeholder="# clases"
                    />
                    <span className="text-xs text-muted">clases</span>
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          const nameEl = document.getElementById(`level-name-${l.id}`) as HTMLInputElement;
                          const minEl = document.getElementById(`level-min-${l.id}`) as HTMLInputElement;
                          const newName = nameEl?.value?.trim() || l.name;
                          const newMin = parseInt(minEl?.value ?? "", 10);
                          setConfig((c) => ({
                            ...c,
                            levelOverrides: {
                              ...c.levelOverrides,
                              [String(l.sortOrder)]: {
                                ...c.levelOverrides[String(l.sortOrder)],
                                name: newName !== l.name ? newName : undefined,
                                minClasses: !isNaN(newMin) && newMin !== l.minClasses ? newMin : undefined,
                              },
                            },
                          }));
                          setEditingLevel(null);
                        }}
                      >
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditingLevel(null)}
                      >
                        <X className="h-4 w-4 text-muted" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{displayName}</span>
                    <Badge variant="secondary" className="text-[11px]">
                      desde {displayMin} clases
                    </Badge>
                    <span
                      className="h-3 w-3 rounded-full ring-2 ring-white"
                      style={{ backgroundColor: l.color }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto h-7 w-7"
                      onClick={() => setEditingLevel(l.id)}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ══════════ ACHIEVEMENTS ══════════ */}
      <Section
        icon={Trophy}
        title="Logros"
        count={enabledAchCount}
        badge={
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-[11px] text-muted">{config.achievementsEnabled ? "Activo" : "Desactivado"}</span>
            <Toggle
              checked={config.achievementsEnabled}
              onChange={(v) =>
                setConfig((c) => ({ ...c, achievementsEnabled: v }))
              }
            />
          </div>
        }
      >
        <div
          className={cn(
            "rounded-xl border border-border/50 bg-white p-4 transition-opacity",
            !config.achievementsEnabled && "opacity-50 pointer-events-none",
          )}
        >
          <p className="mb-3 text-xs text-muted">
            Activa o desactiva logros individuales. Personaliza el nombre y emoji de cada uno para adaptarlos a tu marca.
          </p>
          {Object.entries(achievementsByCategory).map(([cat, items]) => (
            <div key={cat} className="mb-4 last:mb-0">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {categoryLabel(cat)}
              </h4>
              <div className="space-y-1">
                {items.map((a) => {
                  const ovr = getAchOverride(a.key);
                  const enabled = ovr.enabled !== false;
                  const displayName = ovr.name ?? a.name;
                  const displayIcon = ovr.icon ?? a.icon;
                  const isEditing = editingAch === a.key;

                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 text-[13px] transition-all sm:flex-nowrap",
                        enabled ? "bg-surface/50" : "bg-surface/20 opacity-50",
                      )}
                    >
                      {/* Toggle */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <Toggle
                          checked={enabled}
                          onChange={(v) =>
                            setConfig((c) => ({
                              ...c,
                              achievementOverrides: {
                                ...c.achievementOverrides,
                                [a.key]: { ...c.achievementOverrides[a.key], enabled: v },
                              },
                            }))
                          }
                        />
                      </div>

                      {isEditing ? (
                        <>
                          <Input
                            className="h-7 w-12 px-1 text-center text-lg"
                            defaultValue={displayIcon}
                            id={`ach-icon-${a.key}`}
                            maxLength={4}
                          />
                          <Input
                            className="h-7 w-40 text-sm"
                            defaultValue={displayName}
                            id={`ach-name-${a.key}`}
                          />
                          <span className="hidden text-xs text-muted sm:inline">
                            {triggerLabel(a.triggerType)}
                            {a.triggerValue != null && ` (${a.triggerValue})`}
                          </span>
                          <div className="ml-auto flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                const iconEl = document.getElementById(`ach-icon-${a.key}`) as HTMLInputElement;
                                const nameEl = document.getElementById(`ach-name-${a.key}`) as HTMLInputElement;
                                const newIcon = iconEl?.value?.trim() || a.icon;
                                const newName = nameEl?.value?.trim() || a.name;
                                setConfig((c) => ({
                                  ...c,
                                  achievementOverrides: {
                                    ...c.achievementOverrides,
                                    [a.key]: {
                                      ...c.achievementOverrides[a.key],
                                      icon: newIcon !== a.icon ? newIcon : undefined,
                                      name: newName !== a.name ? newName : undefined,
                                    },
                                  },
                                }));
                                setEditingAch(null);
                              }}
                            >
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setEditingAch(null)}
                            >
                              <X className="h-3.5 w-3.5 text-muted" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-lg">{displayIcon}</span>
                          <span className="font-medium">{displayName}</span>
                          <span className="hidden text-muted sm:inline">
                            {triggerLabel(a.triggerType)}
                            {a.triggerValue != null && ` (${a.triggerValue})`}
                          </span>
                          {a.rewardType !== "NONE" && (
                            <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">
                              <Gift className="mr-1 h-3 w-3" />
                              Premio
                            </Badge>
                          )}
                          {enabled && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="ml-auto h-6 w-6"
                              onClick={() => setEditingAch(a.key)}
                            >
                              <Pencil className="h-3 w-3 text-muted" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ══════════ AUTO REWARDS ══════════ */}
      <Section
        icon={Gift}
        title="Premios automáticos"
        count={config.autoRewards.length}
        badge={
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-[11px] text-muted">{config.autoRewardsEnabled ? "Activo" : "Desactivado"}</span>
            <Toggle
              checked={config.autoRewardsEnabled}
              onChange={(v) =>
                setConfig((c) => ({ ...c, autoRewardsEnabled: v }))
              }
            />
          </div>
        }
        defaultOpen={true}
      >
        <div
          className={cn(
            "rounded-xl border border-border/50 bg-white p-4 transition-opacity",
            !config.autoRewardsEnabled && "opacity-50 pointer-events-none",
          )}
        >
          <p className="mb-3 text-xs text-muted">
            Define premios personalizados que se muestran cuando un cliente desbloquea un logro.
            Escribe lo que quieras regalar: un producto, descuento, experiencia, etc.
          </p>

          {config.autoRewards.length > 0 && (
            <div className="mb-4 space-y-2">
              {config.autoRewards.map((ar, idx) => {
                const ach = achievements.find((a) => a.key === ar.achievementKey);
                const ovr = getAchOverride(ar.achievementKey);
                return (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-surface/30 px-3 py-2.5 sm:flex-nowrap"
                  >
                    <span className="text-lg">{ovr.icon ?? ach?.icon ?? "🏆"}</span>
                    <span className="text-sm font-medium">{ovr.name ?? ach?.name ?? ar.achievementKey}</span>
                    <span className="text-muted">→</span>
                    <span className="flex-1 text-sm text-foreground">{ar.rewardText}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          autoRewards: c.autoRewards.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <AutoRewardAdder
            achievements={achievements}
            config={config}
            getAchOverride={getAchOverride}
            onAdd={(entry) =>
              setConfig((c) => ({
                ...c,
                autoRewards: [...c.autoRewards, entry],
              }))
            }
          />
        </div>
      </Section>

      {/* ══════════ RECENT ACHIEVEMENTS (Last 7 days) ══════════ */}
      <Section
        icon={Sparkles}
        title="Logros recientes (7 días)"
        count={recentAch.length}
        defaultOpen={true}
      >
        <div className="rounded-xl border border-border/50 bg-white">
          {recentAch.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              Sin logros desbloqueados en los últimos 7 días.
            </p>
          ) : (
            <div className="divide-y divide-border/30">
              {recentAch.map((ra) => {
                const ovr = getAchOverride(ra.achievement.key);
                const autoReward = config.autoRewards.find(
                  (ar) => ar.achievementKey === ra.achievement.key,
                );
                return (
                  <button
                    key={ra.id}
                    type="button"
                    onClick={() => setPrizeDialog(ra)}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-amber-50/50 sm:flex-nowrap"
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      {ra.user.image && <AvatarImage src={ra.user.image} />}
                      <AvatarFallback className="bg-admin/10 text-[10px] font-bold text-admin">
                        {(ra.user.name || ra.user.email).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">
                          {ra.user.name || ra.user.email}
                        </span>
                        <span className="text-xs text-muted">desbloqueó</span>
                        <span className="text-base">{ovr.icon ?? ra.achievement.icon}</span>
                        <span className="text-sm font-medium">{ovr.name ?? ra.achievement.name}</span>
                      </div>
                      {autoReward && config.autoRewardsEnabled && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                          <Gift className="h-3 w-3" />
                          {autoReward.rewardText}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-muted">
                        {timeAgoShort(ra.earnedAt)}
                      </span>
                      <Gift className="h-4 w-4 text-amber-400 opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-40" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {recentAch.length > 0 && (
            <p className="px-4 pb-3 text-center text-[10px] text-muted">
              Toca una entrada para otorgar un premio manual
            </p>
          )}
        </div>
      </Section>

      {/* ── Grant prize dialog ── */}
      <Dialog open={!!prizeDialog} onOpenChange={(o) => { if (!o) { setPrizeDialog(null); setPrizeText(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-500" />
              Otorgar premio
            </DialogTitle>
          </DialogHeader>
          {prizeDialog && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-surface/50 p-3">
                <Avatar className="h-8 w-8">
                  {prizeDialog.user.image && <AvatarImage src={prizeDialog.user.image} />}
                  <AvatarFallback className="bg-admin/10 text-[10px] font-bold text-admin">
                    {(prizeDialog.user.name || prizeDialog.user.email).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold">{prizeDialog.user.name || prizeDialog.user.email}</p>
                  <p className="text-xs text-muted">
                    {prizeDialog.achievement.icon} {prizeDialog.achievement.name}
                  </p>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  ¿Qué premio le quieres dar?
                </label>
                <Input
                  value={prizeText}
                  onChange={(e) => setPrizeText(e.target.value)}
                  placeholder="Ej: Neceser de la marca, clase gratis, toalla…"
                />
                <p className="mt-1 text-[11px] text-muted">
                  El cliente recibirá una notificación con este premio.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setPrizeDialog(null); setPrizeText(""); }}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-amber-500 hover:bg-amber-600"
                  disabled={!prizeText.trim() || grantPrizeMutation.isPending}
                  onClick={() =>
                    grantPrizeMutation.mutate({
                      userId: prizeDialog.user.id,
                      achievementKey: prizeDialog.achievement.key,
                      rewardText: prizeText.trim(),
                    })
                  }
                >
                  {grantPrizeMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Gift className="mr-2 h-4 w-4" />
                  )}
                  Otorgar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Floating save bar ── */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center border-t border-border/50 bg-white/90 px-4 py-3 backdrop-blur-md sm:bottom-20 sm:left-auto sm:right-4 sm:inset-x-auto sm:rounded-xl sm:border sm:shadow-lg"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">Cambios sin guardar</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocalConfig(null)}
              >
                Descartar
              </Button>
              <Button
                size="sm"
                className="bg-admin hover:bg-admin/90"
                disabled={saveMutation.isPending}
                onClick={() => config && saveMutation.mutate(config)}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Guardar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Auto Reward Adder ── */

function AutoRewardAdder({
  achievements,
  config,
  getAchOverride,
  onAdd,
}: {
  achievements: AchievementRow[];
  config: GamificationConfig;
  getAchOverride: (key: string) => { enabled?: boolean; name?: string; icon?: string };
  onAdd: (entry: AutoRewardEntry) => void;
}) {
  const [achKey, setAchKey] = useState("");
  const [rewardText, setRewardText] = useState("");

  const enabledAchs = achievements.filter((a) => {
    const ovr = getAchOverride(a.key);
    return ovr.enabled !== false;
  });

  const alreadyConfigured = new Set(config.autoRewards.map((ar) => ar.achievementKey));
  const available = enabledAchs.filter((a) => !alreadyConfigured.has(a.key));

  const handleAdd = () => {
    if (!achKey || !rewardText.trim()) return;
    onAdd({ achievementKey: achKey, rewardText: rewardText.trim() });
    setAchKey("");
    setRewardText("");
  };

  return (
    <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
      <div className="w-full space-y-1 sm:w-48">
        <label className="text-[11px] font-medium text-muted">Logro</label>
        <Select value={achKey || undefined} onValueChange={setAchKey}>
          <SelectTrigger className="w-full text-sm">
            <SelectValue placeholder="Seleccionar logro" />
          </SelectTrigger>
          <SelectContent className="max-h-[260px]">
            {available.map((a) => {
              const ovr = getAchOverride(a.key);
              return (
                <SelectItem key={a.key} value={a.key}>
                  {ovr.icon ?? a.icon} {ovr.name ?? a.name}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 space-y-1">
        <label className="text-[11px] font-medium text-muted">Premio (texto libre)</label>
        <Input
          value={rewardText}
          onChange={(e) => setRewardText(e.target.value)}
          placeholder="Ej: Neceser de la marca del estudio"
          className="text-sm"
        />
      </div>
      <Button
        size="sm"
        className="bg-admin hover:bg-admin/90"
        disabled={!achKey || !rewardText.trim()}
        onClick={handleAdd}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Agregar
      </Button>
    </div>
  );
}
