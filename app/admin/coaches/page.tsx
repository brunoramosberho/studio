"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserCog,
  CalendarDays,
  Plus,
  Mail,
  Loader2,
  Trash2,
  X,
  TrendingUp,
  Clock,
  Users,
  Trophy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface UpcomingClass {
  id: string;
  startsAt: string;
  classTypeName: string;
  classTypeColor: string;
  roomName: string;
  studioName: string;
  booked: number;
  capacity: number;
}

interface CoachStats {
  classesThisMonth: number;
  avgOccupancy: number;
  upcomingClasses: UpcomingClass[];
}

interface CoachData {
  id: string;
  userId: string;
  bio: string | null;
  specialties: string[];
  photoUrl: string | null;
  color: string;
  user: { id: string; name: string | null; email: string; image: string | null };
  stats: CoachStats;
}

function OccupancyBar({ value }: { value: number }) {
  const color =
    value >= 70 ? "bg-green-500" :
    value >= 30 ? "bg-amber-400" :
    "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-surface">
        <div
          className={cn("h-2 rounded-full transition-all", color)}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-foreground">
        {value}%
      </span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg" title="1er lugar">🥇</span>;
  if (rank === 2) return <span className="text-lg" title="2do lugar">🥈</span>;
  if (rank === 3) return <span className="text-lg" title="3er lugar">🥉</span>;
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[11px] font-bold text-muted">
      {rank}
    </span>
  );
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function AdminCoachesPage() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: coaches, isLoading } = useQuery<CoachData[]>({
    queryKey: ["admin-coaches"],
    queryFn: async () => {
      const res = await fetch("/api/coaches?stats=true");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (emailToInvite: string) => {
      const res = await fetch("/api/admin/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToInvite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al invitar");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-coaches"] });
      setEmail("");
      setError("");
      setShowInvite(false);
      setSuccessMsg("Coach invitado correctamente");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (coachProfileId: string) => {
      const res = await fetch("/api/admin/coaches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachProfileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al remover");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-coaches"] });
      setRemovingId(null);
    },
    onError: () => setRemovingId(null),
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return;
    inviteMutation.mutate(email.trim());
  }

  const totalClasses = coaches?.reduce((s, c) => s + c.stats.classesThisMonth, 0) ?? 0;
  const avgOccupancyAll = coaches?.length
    ? Math.round(coaches.reduce((s, c) => s + c.stats.avgOccupancy, 0) / coaches.length)
    : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Coaches</h1>
          <p className="mt-1 text-muted">Administra el equipo y revisa su desempeño</p>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <Button
            onClick={() => setShowInvite(!showInvite)}
            className="gap-2 bg-admin text-white hover:bg-admin/90"
          >
            {showInvite ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showInvite ? "Cancelar" : "Invitar coach"}
          </Button>
        </motion.div>
      </div>

      {/* Summary stats */}
      {!isLoading && coaches && coaches.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-admin/10">
                <UserCog className="h-5 w-5 text-admin" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{coaches.length}</p>
                <p className="text-xs text-muted">Coaches</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                <CalendarDays className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{totalClasses}</p>
                <p className="text-xs text-muted">Clases este mes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{avgOccupancyAll}%</p>
                <p className="text-xs text-muted">Ocupación promedio</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Invite form */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Mail className="h-4 w-4 text-coach" />
                  Invitar nuevo coach por correo
                </div>
                <p className="mb-3 text-xs text-muted">
                  Si el correo ya pertenece a un cliente, se le asignará el rol de coach automáticamente.
                </p>
                <form onSubmit={handleInvite} className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    className="flex-1"
                    required
                  />
                  <Button
                    type="submit"
                    disabled={inviteMutation.isPending}
                    className="gap-2"
                    style={{ backgroundColor: "var(--color-coach)", color: "#fff" }}
                  >
                    {inviteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    Enviar
                  </Button>
                </form>
                {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success banner */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700"
          >
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ranking header */}
      {!isLoading && coaches && coaches.length > 1 && (
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-foreground">
            Ranking por ocupación promedio
          </h2>
          <span className="text-xs text-muted">(mayor a menor)</span>
        </div>
      )}

      {/* Coach list */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : !coaches?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <UserCog className="h-10 w-10 text-muted/30" />
            <p className="font-medium text-muted">No hay coaches registrados</p>
            <Button onClick={() => setShowInvite(true)} variant="outline" className="mt-2 gap-2">
              <Plus className="h-4 w-4" />
              Invitar primer coach
            </Button>
          </CardContent>
        </Card>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
          {coaches.map((coach, idx) => {
            const name = coach.user.name ?? "Coach";
            const initials = (coach.user.name || coach.user.email)
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            const isRemoving = removingId === coach.id;
            const isExpanded = expandedId === coach.id;
            const s = coach.stats;
            const rank = idx + 1;

            return (
              <motion.div key={coach.id} variants={fadeUp}>
                <Card className="group overflow-hidden transition-shadow hover:shadow-warm-md">
                  <CardContent className="p-0">
                    {/* Main row */}
                    <div
                      className="flex cursor-pointer items-center gap-4 p-4"
                      onClick={() => setExpandedId(isExpanded ? null : coach.id)}
                    >
                      <RankBadge rank={rank} />

                      <Avatar className="h-11 w-11 ring-2 ring-admin/10">
                        {(coach.photoUrl || coach.user.image) && <AvatarImage src={coach.photoUrl || coach.user.image!} alt={name} />}
                        <AvatarFallback className="bg-admin/10 text-sm text-admin">
                          {initials}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-display text-base font-bold">{name}</h3>
                          {!coach.user.name && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                              Pendiente
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted">{coach.user.email}</p>
                      </div>

                      {/* Quick stats */}
                      <div className="hidden items-center gap-5 sm:flex">
                        <div className="text-center">
                          <p className="text-lg font-bold tabular-nums text-foreground">{s.classesThisMonth}</p>
                          <p className="text-[10px] text-muted">Clases</p>
                        </div>
                        <div className="w-24">
                          <OccupancyBar value={s.avgOccupancy} />
                          <p className="mt-0.5 text-center text-[10px] text-muted">Ocupación</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold tabular-nums text-foreground">{s.upcomingClasses.length}</p>
                          <p className="text-[10px] text-muted">Próximas</p>
                        </div>
                      </div>

                      {/* Remove / expand */}
                      <div className="flex items-center gap-1">
                        {isRemoving ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeMutation.mutate(coach.id)}
                              disabled={removeMutation.isPending}
                              className="h-7 text-xs"
                            >
                              {removeMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : "Sí"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setRemovingId(null)}
                              className="h-7 text-xs"
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setRemovingId(coach.id); }}
                            className="h-8 w-8 p-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                            title="Remover coach"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted" />
                        )}
                      </div>
                    </div>

                    {/* Mobile stats (visible only on small screens) */}
                    <div className="flex items-center gap-4 border-t border-border/30 px-4 py-2.5 sm:hidden">
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span className="font-semibold text-foreground">{s.classesThisMonth}</span> clases
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <Users className="h-3.5 w-3.5" />
                        <span className="font-semibold text-foreground">{s.avgOccupancy}%</span> ocupación
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <Clock className="h-3.5 w-3.5" />
                        <span className="font-semibold text-foreground">{s.upcomingClasses.length}</span> próximas
                      </div>
                    </div>

                    {/* Expanded: upcoming classes + specialties */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-border/30 bg-surface/30 px-4 py-4 space-y-4">
                            {/* Specialties */}
                            {coach.specialties && coach.specialties.length > 0 && (
                              <div>
                                <p className="mb-1.5 text-xs font-medium text-muted">Especialidades</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {coach.specialties.map((sp) => (
                                    <Badge key={sp} variant="secondary" className="text-xs">
                                      {sp}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Upcoming classes */}
                            <div>
                              <p className="mb-2 text-xs font-medium text-muted">
                                Próximas clases asignadas
                              </p>
                              {s.upcomingClasses.length === 0 ? (
                                <p className="text-xs text-muted/60">Sin clases próximas</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {s.upcomingClasses.map((cls) => {
                                    const d = new Date(cls.startsAt);
                                    const occPct = cls.capacity > 0
                                      ? Math.round((cls.booked / cls.capacity) * 100)
                                      : 0;
                                    return (
                                      <div
                                        key={cls.id}
                                        className="flex items-center gap-3 rounded-lg bg-white px-3 py-2"
                                      >
                                        <div
                                          className="h-2 w-2 rounded-full shrink-0"
                                          style={{ backgroundColor: cls.classTypeColor }}
                                        />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-medium text-foreground truncate">
                                            {cls.classTypeName}
                                            <span className="font-normal text-muted">
                                              {" "}· {cls.roomName} · {cls.studioName}
                                            </span>
                                          </p>
                                          <p className="text-[11px] text-muted">
                                            {format(d, "EEE d MMM · HH:mm", { locale: es })}
                                          </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="text-xs font-semibold tabular-nums">
                                            {cls.booked}/{cls.capacity}
                                          </p>
                                          <p className={cn(
                                            "text-[10px] font-medium",
                                            occPct >= 70 ? "text-green-600" :
                                            occPct >= 30 ? "text-amber-500" :
                                            "text-red-400",
                                          )}>
                                            {occPct}%
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
