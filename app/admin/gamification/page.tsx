"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Layers,
  Medal,
  Users,
  Gift,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface GamificationOverview {
  loyaltyLevels: {
    id: string;
    name: string;
    minClasses: number;
    icon: string;
    color: string;
    rewardOnUnlock: unknown;
  }[];
  systemAchievements: {
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
  }[];
  tenantAchievements: {
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
  }[];
  stats: {
    clientsWithProgress: number;
    totalMemberAchievements: number;
  };
}

interface MemberRow {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  levelName: string | null;
  levelIcon: string | null;
  totalClasses: number;
  currentStreak: number;
  achievementCount: number;
}

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
  };
  return map[t] ?? t;
}

export default function AdminGamificationPage() {
  const queryClient = useQueryClient();
  const [openLevels, setOpenLevels] = useState(true);
  const [openSystem, setOpenSystem] = useState(false);
  const [openTenant, setOpenTenant] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [grantUserId, setGrantUserId] = useState<string>("");
  const [grantKey, setGrantKey] = useState<string>("");

  const { data: overview, isLoading: loadingOverview } = useQuery<GamificationOverview>({
    queryKey: ["admin", "gamification"],
    queryFn: async () => {
      const res = await fetch("/api/admin/gamification");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: membersData, isLoading: loadingMembers } = useQuery<{ members: MemberRow[] }>({
    queryKey: ["admin", "gamification", "members", memberSearch],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (memberSearch.trim()) q.set("q", memberSearch.trim());
      const res = await fetch(`/api/admin/gamification/members?${q}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const grantMutation = useMutation({
    mutationFn: async (body: { userId: string; achievementKey: string }) => {
      const res = await fetch("/api/admin/gamification/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "gamification", "members"] });
      setGrantUserId("");
      setGrantKey("");
    },
  });

  const allGrantableKeys =
    overview != null
      ? [
          ...overview.systemAchievements.filter((a) => a.active).map((a) => a.key),
          ...overview.tenantAchievements.filter((a) => a.active).map((a) => a.key),
        ]
      : [];

  const achievementOptions =
    overview != null
      ? [
          ...overview.systemAchievements.filter((a) => a.active),
          ...overview.tenantAchievements.filter((a) => a.active),
        ]
      : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Gamificación</h1>
        <p className="mt-1 text-muted">
          Niveles globales, catálogo de logros y progreso de miembros. Los niveles y los logros de
          sistema se definen en la base de datos (seed); aquí puedes verlos y otorgar logros a mano.
        </p>
      </motion.div>

      {loadingOverview ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : overview ? (
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-3">
          <Card className="border-admin/10">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-admin/10">
                <Layers className="h-5 w-5 text-admin" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{overview.loyaltyLevels.length}</p>
                <p className="text-xs text-muted">Niveles de lealtad</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-admin/10">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-admin/10">
                <Medal className="h-5 w-5 text-admin" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {overview.systemAchievements.length + overview.tenantAchievements.length}
                </p>
                <p className="text-xs text-muted">Logros en catálogo</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-admin/10">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-admin/10">
                <Gift className="h-5 w-5 text-admin" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {overview.stats.totalMemberAchievements}
                </p>
                <p className="text-xs text-muted">Desbloqueos totales</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      <Card className="border-amber-200/80 bg-amber-50/40">
        <CardContent className="flex gap-3 p-4 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1 text-muted">
            <p className="font-medium text-foreground">¿Qué se controla desde aquí y qué no?</p>
            <ul className="list-inside list-disc space-y-0.5 text-[13px]">
              <li>
                <strong className="text-foreground">Niveles</strong> (Bronce → Elite): globales para
                toda la plataforma. Solo se cambian con migración/seed o soporte técnico.
              </li>
              <li>
                <strong className="text-foreground">Logros de sistema</strong>: mismos para todos los
                estudios; la lista es de solo lectura. Las reglas automáticas viven en código +
                catálogo.
              </li>
              <li>
                <strong className="text-foreground">Logros del estudio</strong>: en el futuro podrás
                crear logros propios (tenant); hoy el catálogo personalizado aparece aquí si existe.
              </li>
              <li>
                <strong className="text-foreground">Otorgar logro</strong>: puedes conceder cualquier
                logro activo a un cliente (feed, notificación y premio si aplica).
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Niveles */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <button
          type="button"
          onClick={() => setOpenLevels((v) => !v)}
          className="mb-2 flex w-full items-center justify-between rounded-xl border border-border/50 bg-white px-4 py-3 text-left transition-colors hover:bg-surface/60"
        >
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <Layers className="h-4 w-4 text-admin" />
            Niveles de lealtad (solo lectura)
          </span>
          {openLevels ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
        </button>
        {openLevels && overview && (
          <div className="space-y-2 rounded-xl border border-border/50 bg-white p-4">
            {overview.loyaltyLevels.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5"
              >
                <span className="text-xl">{l.icon}</span>
                <span className="font-semibold">{l.name}</span>
                <Badge variant="secondary" className="text-[11px]">
                  desde {l.minClasses} clases
                </Badge>
                <span
                  className="ml-auto h-3 w-3 rounded-full ring-2 ring-white"
                  style={{ backgroundColor: l.color }}
                  title={l.color}
                />
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Logros sistema */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <button
          type="button"
          onClick={() => setOpenSystem((v) => !v)}
          className="mb-2 flex w-full items-center justify-between rounded-xl border border-border/50 bg-white px-4 py-3 text-left transition-colors hover:bg-surface/60"
        >
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <Trophy className="h-4 w-4 text-admin" />
            Logros de sistema ({overview?.systemAchievements.length ?? 0})
          </span>
          {openSystem ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
        </button>
        {openSystem && overview && (
          <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-xl border border-border/50 bg-white p-3">
            {overview.systemAchievements.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 text-[13px]",
                  a.active ? "bg-surface/50" : "bg-surface/20 opacity-60",
                )}
              >
                <span className="text-lg">{a.icon}</span>
                <span className="font-medium">{a.name}</span>
                <code className="rounded bg-muted/50 px-1.5 py-0.5 text-[11px]">{a.key}</code>
                <span className="text-muted">{categoryLabel(a.category)}</span>
                <span className="text-muted">· {triggerLabel(a.triggerType)}</span>
                {a.triggerValue != null && (
                  <span className="text-muted">({a.triggerValue})</span>
                )}
                {!a.active && (
                  <Badge variant="outline" className="text-[10px]">
                    inactivo
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Logros del tenant */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <button
          type="button"
          onClick={() => setOpenTenant((v) => !v)}
          className="mb-2 flex w-full items-center justify-between rounded-xl border border-border/50 bg-white px-4 py-3 text-left transition-colors hover:bg-surface/60"
        >
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <Medal className="h-4 w-4 text-admin" />
            Logros del estudio ({overview?.tenantAchievements.length ?? 0})
          </span>
          {openTenant ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
        </button>
        {openTenant && overview && (
          <div className="rounded-xl border border-border/50 bg-white p-4">
            {overview.tenantAchievements.length === 0 ? (
              <p className="text-sm text-muted">
                No hay logros solo de este estudio. Para añadirlos hace falta crearlos en base de datos
                o una futura pantalla de alta.
              </p>
            ) : (
              <div className="space-y-1">
                {overview.tenantAchievements.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface/50 px-2 py-2 text-[13px]">
                    <span className="text-lg">{a.icon}</span>
                    <span className="font-medium">{a.name}</span>
                    <code className="rounded bg-muted/50 px-1.5 py-0.5 text-[11px]">{a.key}</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Otorgar logro */}
      <Card className="border-admin/15">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-admin" />
            Otorgar logro manualmente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted">Cliente</label>
              <Select value={grantUserId || undefined} onValueChange={setGrantUserId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {(membersData?.members ?? []).map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name ?? m.email} — {m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted">Logro</label>
              <Select value={grantKey || undefined} onValueChange={setGrantKey}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un logro" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {achievementOptions.map((a) => (
                    <SelectItem key={a.key} value={a.key}>
                      {a.icon} {a.name} ({a.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {grantMutation.isError && (
            <p className="text-sm text-destructive">{(grantMutation.error as Error).message}</p>
          )}
          {grantMutation.isSuccess && (
            <p className="text-sm text-green-700">Logro otorgado correctamente.</p>
          )}
          <Button
            disabled={!grantUserId || !grantKey || grantMutation.isPending || allGrantableKeys.length === 0}
            onClick={() => grantMutation.mutate({ userId: grantUserId, achievementKey: grantKey })}
            className="bg-admin hover:bg-admin/90"
          >
            {grantMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Otorgando…
              </>
            ) : (
              "Otorgar logro"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Miembros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-admin" />
            Progreso de miembros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              placeholder="Buscar por nombre o email…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {loadingMembers ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/50">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border/50 bg-surface/40 text-xs font-semibold uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2.5">Miembro</th>
                    <th className="px-3 py-2.5">Nivel</th>
                    <th className="px-3 py-2.5 text-right">Clases</th>
                    <th className="px-3 py-2.5 text-right">Racha</th>
                    <th className="px-3 py-2.5 text-right">Logros</th>
                  </tr>
                </thead>
                <tbody>
                  {(membersData?.members ?? []).map((m) => (
                    <tr key={m.userId} className="border-b border-border/30 last:border-0">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground">{m.name ?? "—"}</div>
                        <div className="text-xs text-muted">{m.email}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        {m.levelName ? (
                          <span className="inline-flex items-center gap-1">
                            <span>{m.levelIcon}</span> {m.levelName}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{m.totalClasses}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{m.currentStreak}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{m.achievementCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(membersData?.members ?? []).length === 0 && (
                <p className="p-6 text-center text-sm text-muted">No hay clientes que coincidan.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
