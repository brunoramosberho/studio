"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  Package,
  CalendarDays,
  Trophy,
  Flame,
  TrendingUp,
  Clock,
  Smartphone,
  Plus,
  Minus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Mail,
  Phone,
  Cake,
  Star,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ClientDetail {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  phone: string | null;
  birthday: string | null;
  instagramUser: string | null;
  stravaUser: string | null;
  memberSince: string;
  pwaInstalledAt: string | null;
  role: string;
  stats: {
    totalClasses: number;
    classesThisMonth: number;
    totalBookings: number;
    currentStreak: number;
    longestStreak: number;
    daysSinceLastVisit: number | null;
    freeClassCredits: number;
  };
  level: { name: string; icon: string; color: string; minClasses: number } | null;
  nextLevel: { name: string; icon: string; color: string; minClasses: number } | null;
  progressPercent: number;
  classesToNext: number;
  achievements: {
    id: string;
    name: string;
    icon: string;
    description: string | null;
    earned: boolean;
    earnedAt: string | null;
  }[];
  packages: {
    id: string;
    name: string;
    type: string;
    creditsTotal: number | null;
    creditsUsed: number;
    creditsRemaining: number;
    expiresAt: string;
    isActive: boolean;
  }[];
  upcomingBookings: {
    id: string;
    classId: string;
    className: string;
    classColor: string | null;
    coachName: string | null;
    roomName: string;
    startsAt: string;
    endsAt: string;
    status: string;
    spotNumber: number | null;
  }[];
  pastBookings: {
    id: string;
    classId: string;
    className: string;
    classColor: string | null;
    coachName: string | null;
    startsAt: string;
    status: string;
  }[];
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  ATTENDED: { label: "Asistió", color: "text-green-600 bg-green-50", icon: CheckCircle2 },
  CONFIRMED: { label: "Confirmado", color: "text-blue-600 bg-blue-50", icon: CalendarDays },
  NO_SHOW: { label: "No asistió", color: "text-red-600 bg-red-50", icon: XCircle },
  CANCELLED: { label: "Cancelado", color: "text-gray-500 bg-gray-50", icon: AlertCircle },
};

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: typeof Trophy;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold">{value}</p>
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", accent || "bg-admin/10")}>
            <Icon className={cn("h-5 w-5", accent ? "text-white" : "text-admin")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: client, isLoading, error } = useQuery<ClientDetail>({
    queryKey: ["admin-client", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/clients/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  const creditMutation = useMutation({
    mutationFn: async ({ userPackageId, delta }: { userPackageId: string; delta: number }) => {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPackageId, delta }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-client", id] }),
  });

  const attendanceMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: "ATTENDED" | "NO_SHOW" }) => {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      toast.success(variables.status === "ATTENDED" ? "Marcado como asistió" : "Marcado como no asistió");
    },
    onError: () => toast.error("Error al actualizar asistencia"),
  });

  const [showExpiredPkgs, setShowExpiredPkgs] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3 py-4">
          <div className="h-5 w-5 animate-pulse rounded bg-surface" />
          <div className="h-5 w-32 animate-pulse rounded bg-surface" />
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <div className="h-64 animate-pulse rounded-2xl bg-surface" />
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />
              ))}
            </div>
            <div className="h-48 animate-pulse rounded-2xl bg-surface" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="mx-auto max-w-5xl py-12 text-center">
        <p className="text-muted">Cliente no encontrado</p>
        <Link href="/admin/clients">
          <Button variant="ghost" className="mt-4">Volver a clientes</Button>
        </Link>
      </div>
    );
  }

  const displayName = client.name || client.email;
  const initials = (client.name || client.email)
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const earnedAchievements = client.achievements.filter((a) => a.earned);
  const lockedAchievements = client.achievements.filter((a) => !a.earned);
  const activePackage = client.packages.find((p) => p.isActive);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Back + breadcrumb */}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2 text-sm"
      >
        <Link
          href="/admin/clients"
          className="flex items-center gap-1.5 text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Clientes
        </Link>
        <ChevronRight className="h-3 w-3 text-muted/50" />
        <span className="font-medium text-foreground">{displayName}</span>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Left sidebar ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Profile card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-20 w-20 ring-4 ring-admin/10">
                  {client.image && <AvatarImage src={client.image} />}
                  <AvatarFallback className="bg-admin/10 text-xl font-bold text-admin">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <h2 className="mt-3 font-display text-lg font-bold">{displayName}</h2>
                {client.name && (
                  <p className="text-sm text-muted">{client.email}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  <Badge variant="admin" className="text-[10px]">{client.role}</Badge>
                  {client.pwaInstalledAt && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Smartphone className="h-3 w-3" /> App
                    </Badge>
                  )}
                </div>
              </div>

              <Separator className="my-4" />

              {/* Contact info */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate text-foreground">{client.email}</span>
                </div>
                {client.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 shrink-0 text-muted" />
                    <span className="text-foreground">{client.phone}</span>
                  </div>
                )}
                {client.birthday && (
                  <div className="flex items-center gap-3 text-sm">
                    <Cake className="h-4 w-4 shrink-0 text-muted" />
                    <span className="text-foreground">
                      {format(new Date(client.birthday), "d 'de' MMMM, yyyy", { locale: es })}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 shrink-0 text-muted" />
                  <span className="text-muted">
                    Miembro desde {format(new Date(client.memberSince), "MMM yyyy", { locale: es })}
                  </span>
                </div>
                {client.instagramUser && (
                  <a
                    href={`https://instagram.com/${client.instagramUser}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 text-sm text-muted transition-colors hover:text-foreground"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    @{client.instagramUser}
                  </a>
                )}
              </div>

              {client.pwaInstalledAt && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Smartphone className="h-3.5 w-3.5" />
                    App instalada {timeAgo(client.pwaInstalledAt)}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Level progress */}
          {client.level && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{client.level.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: client.level.color }}>
                      {client.level.name}
                    </p>
                    {client.nextLevel ? (
                      <p className="text-[11px] text-muted">
                        {client.classesToNext} clases para {client.nextLevel.name}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted">Nivel máximo</p>
                    )}
                  </div>
                </div>
                {client.nextLevel && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span>{client.level.name}</span>
                      <span>{client.nextLevel.name}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${client.progressPercent}%`,
                          backgroundColor: client.level.color,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-center text-[10px] font-medium text-muted">
                      {client.progressPercent}%
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Achievements */}
          {client.achievements.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-semibold">Logros</span>
                  </div>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    {earnedAchievements.length}/{client.achievements.length}
                  </span>
                </div>
                {earnedAchievements.length > 0 ? (
                  <div className="grid grid-cols-4 gap-1.5">
                    {earnedAchievements.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-col items-center gap-0.5 rounded-lg bg-surface px-1 py-2 text-center"
                        title={a.description || a.name}
                      >
                        <span className="text-lg">{a.icon}</span>
                        <span className="text-[8px] font-semibold leading-tight text-foreground">
                          {a.name}
                        </span>
                      </div>
                    ))}
                    {lockedAchievements.slice(0, 4).map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-col items-center gap-0.5 rounded-lg bg-surface/40 px-1 py-2 text-center opacity-30 grayscale"
                        title={a.description || a.name}
                      >
                        <span className="text-lg">{a.icon}</span>
                        <span className="text-[8px] font-semibold leading-tight text-foreground">
                          {a.name}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted/60">Sin logros aún</p>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* ── Main content ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-5 lg:col-span-2"
        >
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total clases" value={client.stats.totalClasses} icon={CalendarDays} />
            <StatCard label="Este mes" value={client.stats.classesThisMonth} icon={TrendingUp} />
            <StatCard label="Racha actual" value={client.stats.currentStreak} icon={Flame} />
            <StatCard
              label="Última visita"
              value={
                client.stats.daysSinceLastVisit !== null
                  ? client.stats.daysSinceLastVisit === 0
                    ? "Hoy"
                    : `${client.stats.daysSinceLastVisit}d`
                  : "—"
              }
              icon={Clock}
            />
          </div>

          {/* Packages */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-admin" />
                  <span className="text-sm font-semibold">Paquetes activos</span>
                </div>
                {client.packages.some((p) => !p.isActive) && (
                  <button
                    onClick={() => setShowExpiredPkgs(!showExpiredPkgs)}
                    className="text-xs font-medium text-admin hover:underline"
                  >
                    {showExpiredPkgs ? "Ocultar anteriores" : "Ver anteriores"}
                  </button>
                )}
              </div>
              {client.packages.filter((p) => showExpiredPkgs || p.isActive).length > 0 ? (
                <div className="space-y-2.5">
                  {client.packages.filter((p) => showExpiredPkgs || p.isActive).map((pkg) => (
                    <div
                      key={pkg.id}
                      className={cn(
                        "rounded-lg border p-3.5 transition-colors",
                        pkg.isActive
                          ? "border-border/60 bg-white"
                          : "border-border/40 bg-surface/30 opacity-60",
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{pkg.name}</p>
                            {pkg.isActive && (
                              <Badge className="bg-green-100 text-[10px] text-green-700">Activo</Badge>
                            )}
                            {!pkg.isActive && (
                              <Badge variant="secondary" className="text-[10px]">Expirado</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {pkg.isActive ? "Expira" : "Expiró"} {formatDate(pkg.expiresAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-lg font-bold">
                            {pkg.creditsRemaining === -1 ? "∞" : pkg.creditsRemaining}
                          </p>
                          <p className="text-[10px] text-muted">créditos</p>
                        </div>
                      </div>
                      {pkg.isActive && pkg.creditsRemaining !== -1 && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                            <div
                              className="h-full rounded-full bg-admin"
                              style={{
                                width: `${pkg.creditsTotal ? Math.max(2, (pkg.creditsRemaining / pkg.creditsTotal) * 100) : 0}%`,
                              }}
                            />
                          </div>
                          <div className="flex gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => creditMutation.mutate({ userPackageId: pkg.id, delta: -1 })}
                              disabled={creditMutation.isPending}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => creditMutation.mutate({ userPackageId: pkg.id, delta: 1 })}
                              disabled={creditMutation.isPending}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted/60">Sin paquetes</p>
              )}
            </CardContent>
          </Card>

          {/* Upcoming bookings */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-semibold">Próximas clases</span>
                {client.upcomingBookings.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {client.upcomingBookings.length}
                  </Badge>
                )}
              </div>
              {client.upcomingBookings.length > 0 ? (
                <div className="space-y-2">
                  {client.upcomingBookings.map((b) => (
                    <Link
                      key={b.id}
                      href={`/admin/class/${b.classId}`}
                      className="flex items-center gap-3 rounded-lg border border-border/40 bg-white px-4 py-3 transition-colors hover:bg-surface/50"
                    >
                      <div
                        className="h-9 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: b.classColor || "var(--color-admin)" }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{b.className}</p>
                        <p className="text-xs text-muted">
                          {b.coachName} · {b.roomName}
                          {b.spotNumber ? ` · Spot ${b.spotNumber}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium">
                          {format(new Date(b.startsAt), "d MMM", { locale: es })}
                        </p>
                        <p className="text-xs text-muted">
                          {format(new Date(b.startsAt), "h:mm a")}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted/40" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted/60">Sin reservas próximas</p>
              )}
            </CardContent>
          </Card>

          {/* Past bookings */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-muted" />
                  <span className="text-sm font-semibold">Historial de actividad</span>
                </div>
                {client.pastBookings.length > 10 && (
                  <button
                    onClick={() => setShowAllHistory(!showAllHistory)}
                    className="text-xs font-medium text-admin hover:underline"
                  >
                    {showAllHistory ? "Ver recientes" : `Ver todo (${client.pastBookings.length})`}
                  </button>
                )}
              </div>
              {client.pastBookings.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-surface/50">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Clase
                        </th>
                        <th className="hidden px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted sm:table-cell">
                          Coach
                        </th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Fecha
                        </th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Asistencia
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllHistory ? client.pastBookings : client.pastBookings.slice(0, 10)).map((b, i, arr) => {
                        const statusInfo = STATUS_MAP[b.status] || STATUS_MAP.CONFIRMED;
                        const StatusIcon = statusInfo.icon;
                        const canToggle = b.status !== "CANCELLED";
                        return (
                          <tr
                            key={b.id}
                            className={cn(
                              "transition-colors hover:bg-surface/30",
                              i < arr.length - 1 && "border-b border-border/30",
                            )}
                          >
                            <td className="px-4 py-2.5">
                              <Link
                                href={`/admin/class/${b.classId}`}
                                className="flex items-center gap-2 hover:underline"
                              >
                                <div
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: b.classColor || "#9ca3af" }}
                                />
                                <span className="font-medium">{b.className}</span>
                              </Link>
                            </td>
                            <td className="hidden px-4 py-2.5 text-muted sm:table-cell">
                              {b.coachName || "—"}
                            </td>
                            <td className="px-4 py-2.5 text-muted">
                              {format(new Date(b.startsAt), "d MMM yyyy", { locale: es })}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                {canToggle ? (
                                  <>
                                    <button
                                      onClick={() => attendanceMutation.mutate({ bookingId: b.id, status: "ATTENDED" })}
                                      disabled={attendanceMutation.isPending}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                                        b.status === "ATTENDED"
                                          ? "bg-green-100 text-green-700"
                                          : "bg-surface text-muted hover:bg-green-50 hover:text-green-600",
                                      )}
                                      title="Marcar asistencia"
                                    >
                                      <CheckCircle2 className="h-3 w-3" />
                                      Sí
                                    </button>
                                    <button
                                      onClick={() => attendanceMutation.mutate({ bookingId: b.id, status: "NO_SHOW" })}
                                      disabled={attendanceMutation.isPending}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                                        b.status === "NO_SHOW"
                                          ? "bg-red-50 text-red-600"
                                          : "bg-surface text-muted hover:bg-red-50 hover:text-red-500",
                                      )}
                                      title="Marcar como no asistió"
                                    >
                                      <XCircle className="h-3 w-3" />
                                      No
                                    </button>
                                  </>
                                ) : (
                                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", statusInfo.color)}>
                                    <StatusIcon className="h-3 w-3" />
                                    {statusInfo.label}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted/60">Sin historial de actividad</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
