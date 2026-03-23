"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  CalendarDays,
  Users,
  Clock,
  ChevronRight,
  TrendingUp,
  Trophy,
  AlertTriangle,
  Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn, formatTime, formatCurrency } from "@/lib/utils";
import type { ClassWithDetails } from "@/types";

interface TopClient {
  user: {
    id: string;
    name: string | null;
    image: string | null;
    email: string;
    memberSince: string;
  };
  classesWithCoach: number;
  totalClasses: number;
  noShows: number;
  lastClass: { date: string; className: string } | null;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function useCountdown(targetDate: Date | null) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!targetDate) return;
    const tick = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("¡Ahora!");
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setTimeLeft(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return timeLeft;
}

export default function CoachDashboard() {
  const { data: session } = useSession();
  const coachName = session?.user?.name?.split(" ")[0] ?? "Coach";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59).toISOString();

  const { data: todayClasses, isLoading } = useQuery<ClassWithDetails[]>({
    queryKey: ["coach-classes-today", todayStart],
    queryFn: async () => {
      const res = await fetch(
        `/api/classes?from=${todayStart}&to=${todayEnd}&coachId=${session?.user?.id}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!session?.user?.id,
  });

  const { data: weekClasses } = useQuery<ClassWithDetails[]>({
    queryKey: ["coach-classes-week", todayStart],
    queryFn: async () => {
      const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const res = await fetch(
        `/api/classes?from=${tomorrowStart}&to=${weekEnd}&coachId=${session?.user?.id}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!session?.user?.id,
  });

  const { data: topClients, isLoading: topClientsLoading } = useQuery<TopClient[]>({
    queryKey: ["coach-top-clients"],
    queryFn: async () => {
      const res = await fetch("/api/coach/top-clients");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!session?.user?.id,
  });

  const classes = todayClasses;
  const upcoming = classes
    ?.filter((c) => new Date(c.startsAt) > now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const nextClass = upcoming?.[0] ?? (weekClasses?.[0] ?? null);
  const countdown = useCountdown(nextClass ? new Date(nextClass.startsAt) : null);

  const classesToday = classes?.length ?? 0;
  const studentsToday =
    classes?.reduce((sum, c) => sum + (c._count?.bookings ?? c.bookings.length), 0) ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          Hola, Coach {coachName}
        </h1>
        <p className="mt-1 text-muted">Aquí está tu día de un vistazo</p>
      </motion.div>

      {/* Quick stats */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-3 gap-3"
      >
        <motion.div variants={fadeUp}>
          <Card className="border-coach/10">
            <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
              <CalendarDays className="h-5 w-5 text-coach/60" />
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <span className="font-mono text-2xl font-bold text-foreground">
                  {classesToday}
                </span>
              )}
              <span className="text-xs text-muted">Clases hoy</span>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Card className="border-coach/10">
            <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
              <Users className="h-5 w-5 text-coach/60" />
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <span className="font-mono text-2xl font-bold text-foreground">
                  {studentsToday}
                </span>
              )}
              <span className="text-xs text-muted">Alumnas hoy</span>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Link href="/coach/stats">
            <Card className="border-coach/10 h-full transition-all hover:shadow-warm-md">
              <CardContent className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
                <TrendingUp className="h-5 w-5 text-coach/60" />
                <span className="text-xs font-semibold text-coach">
                  Mi historial
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted" />
              </CardContent>
            </Card>
          </Link>
        </motion.div>
      </motion.div>

      {/* Next class highlight */}
      {nextClass && (
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Link href={`/coach/class/${nextClass.id}`}>
            <Card className="overflow-hidden border-coach/20 bg-gradient-to-br from-coach/5 to-transparent transition-shadow hover:shadow-warm-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-coach/10">
                  <Clock className="h-6 w-6 text-coach" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-coach">Siguiente clase</p>
                  <p className="truncate font-display text-lg font-bold">
                    {nextClass.classType.name}
                  </p>
                  <p className="text-sm text-muted">
                    {formatTime(nextClass.startsAt)} ·{" "}
                    {nextClass._count?.bookings ?? nextClass.bookings.length}/
                    {nextClass.classType.maxCapacity} inscritos
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-coach/70">
                    Empieza en
                  </p>
                  <span className="font-mono text-xl font-bold text-coach">
                    {countdown}
                  </span>
                  <ChevronRight className="ml-auto mt-1 h-4 w-4 text-muted" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </motion.div>
      )}

      {/* Today's schedule */}
      <motion.div variants={stagger} initial="hidden" animate="show">
        <h2 className="mb-4 font-display text-xl font-bold">Horario de hoy</h2>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : !classes?.length ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <CalendarDays className="h-10 w-10 text-muted/40" />
              <p className="font-medium text-muted">No tienes clases hoy</p>
              <p className="text-sm text-muted/70">Disfruta tu día libre</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {classes.map((cls) => {
              const enrolled = cls._count?.bookings ?? cls.bookings.length;
              const capacity = cls.classType.maxCapacity;
              const past = new Date(cls.endsAt) < now;
              return (
                <motion.div key={cls.id} variants={fadeUp}>
                  <Link href={`/coach/class/${cls.id}`}>
                    <Card
                      className={cn(
                        "transition-all hover:shadow-warm-md",
                        past && "opacity-50",
                      )}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        <div className="flex shrink-0 flex-col items-center">
                          <span className="font-mono text-sm font-semibold">
                            {formatTime(cls.startsAt)}
                          </span>
                          <span className="text-xs text-muted">
                            {formatTime(cls.endsAt)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-base font-bold">
                            {cls.classType.name}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-muted" />
                            <span className="text-sm text-muted">
                              {enrolled}/{capacity}
                            </span>
                          </div>
                        </div>
                        <Badge
                          variant={past ? "secondary" : enrolled >= capacity ? "danger" : "success"}
                        >
                          {past ? "Terminada" : enrolled >= capacity ? "Llena" : "Abierta"}
                        </Badge>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
      {/* Upcoming this week */}
      {weekClasses && weekClasses.length > 0 && (
        <motion.div variants={stagger} initial="hidden" animate="show">
          <h2 className="mb-4 font-display text-xl font-bold">Próximos días</h2>
          <div className="space-y-3">
            {weekClasses.slice(0, 10).map((cls) => {
              const enrolled = cls._count?.bookings ?? cls.bookings.length;
              const capacity = cls.classType.maxCapacity;
              const classDate = new Date(cls.startsAt);
              const dayLabel = classDate.toLocaleDateString("es-MX", {
                weekday: "short",
                day: "numeric",
                month: "short",
              });
              return (
                <motion.div key={cls.id} variants={fadeUp}>
                  <Link href={`/coach/class/${cls.id}`}>
                    <Card className="transition-all hover:shadow-warm-md">
                      <CardContent className="flex items-center gap-4 p-4">
                        <div className="flex shrink-0 flex-col items-center">
                          <span className="text-[11px] font-medium uppercase text-muted">
                            {dayLabel}
                          </span>
                          <span className="font-mono text-sm font-semibold">
                            {formatTime(cls.startsAt)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-base font-bold">
                            {cls.classType.name}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-muted" />
                            <span className="text-sm text-muted">
                              {enrolled}/{capacity}
                            </span>
                          </div>
                        </div>
                        <Badge
                          variant={enrolled >= capacity ? "danger" : "success"}
                        >
                          {enrolled >= capacity ? "Llena" : "Abierta"}
                        </Badge>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Top clients */}
      <motion.div variants={stagger} initial="hidden" animate="show">
        <h2 className="mb-4 font-display text-xl font-bold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-coach" />
          Mis mejores alumnas
        </h2>

        {topClientsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : !topClients?.length ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Users className="h-8 w-8 text-muted/30" />
              <p className="text-sm text-muted">Aún no hay datos de alumnas</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {topClients.map((client, idx) => {
              const name = client.user.name ?? client.user.email;
              const initials = (client.user.name ?? "U")
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2);
              const memberMonths = Math.floor(
                (Date.now() - new Date(client.user.memberSince).getTime()) /
                  (1000 * 60 * 60 * 24 * 30),
              );
              const lastDate = client.lastClass
                ? new Date(client.lastClass.date).toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "short",
                  })
                : null;

              return (
                <motion.div key={client.user.id} variants={fadeUp}>
                  <Card className={cn(
                    "transition-all",
                    idx === 0 && "border-yellow-200 bg-yellow-50/30",
                    idx === 1 && "border-stone-200 bg-stone-50/20",
                    idx === 2 && "border-amber-200 bg-amber-50/15",
                  )}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          {client.user.image && (
                            <AvatarImage src={client.user.image} alt={name} />
                          )}
                          <AvatarFallback className="text-xs font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        {idx < 3 && (
                          <span className={cn(
                            "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                            idx === 0 && "bg-yellow-400 text-yellow-900",
                            idx === 1 && "bg-stone-300 text-stone-700",
                            idx === 2 && "bg-amber-300 text-amber-800",
                          )}>
                            {idx + 1}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            {client.classesWithCoach} contigo
                          </span>
                          <span>{client.totalClasses} total</span>
                          {memberMonths > 0 && (
                            <span>
                              {memberMonths >= 12
                                ? `${Math.floor(memberMonths / 12)}a ${memberMonths % 12}m`
                                : `${memberMonths}m`}{" "}
                              miembro
                            </span>
                          )}
                        </div>
                        {client.noShows > 0 && (
                          <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-orange-600">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {client.noShows} cancelación{client.noShows > 1 ? "es" : ""}
                          </span>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        {lastDate && (
                          <p className="text-[10px] text-muted">
                            Última: {lastDate}
                          </p>
                        )}
                        {client.lastClass && (
                          <p className="text-[11px] font-medium text-foreground">
                            {client.lastClass.className}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      <div className="pb-8" />
    </div>
  );
}
