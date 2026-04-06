"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Users,
  ChevronDown,
  ChevronUp,
  Package,
  CalendarDays,
  Plus,
  Minus,
  Loader2,
  AlertTriangle,
  Trophy,
  Star,
  Heart,
  Clock,
  UserPlus,
  Smartphone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { CreateClientDialog } from "@/components/admin/create-client-dialog";

interface ClientData {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  memberSince: string;
  pwaInstalledAt: string | null;
  classesThisMonth: number;
  daysSinceLastVisit: number | null;
  activePackage?: {
    id: string;
    packageName: string;
    creditsRemaining: number;
    expiresAt: string;
  } | null;
  bookingsCount: number;
  lastVisited: string | null;
  bookingHistory?: {
    id: string;
    className: string;
    date: string;
    status: string;
  }[];
}

interface AtRiskMember {
  id: string;
  name: string | null;
  image: string | null;
  email: string;
  lastClass: string | null;
  daysSinceLastVisit: number | null;
}

interface TopMember {
  id: string;
  name: string | null;
  image: string | null;
  value: number;
}

interface InsightsData {
  atRisk: AtRiskMember[];
  topMembers: {
    mostClassesThisMonth: TopMember[];
    mostClassesAllTime: TopMember[];
    mostSocialActivity: TopMember[];
  };
}

type Filter = "all" | "active" | "expiring" | "inactive" | "new" | "pwa";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "expiring", label: "Por vencer" },
  { key: "inactive", label: "Inactivos" },
  { key: "new", label: "Nuevos" },
  { key: "pwa", label: "Con PWA" },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

function MemberAvatar({
  name,
  image,
  size = "md",
}: {
  name: string | null;
  image: string | null;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const text = size === "sm" ? "text-xs" : "text-sm";
  const initials = (name ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return image ? (
    <img
      src={image}
      alt=""
      className={cn(dim, "shrink-0 rounded-full object-cover")}
    />
  ) : (
    <div
      className={cn(
        dim,
        "flex shrink-0 items-center justify-center rounded-full bg-admin/10",
      )}
    >
      <span className={cn(text, "font-semibold text-admin")}>{initials}</span>
    </div>
  );
}

export default function AdminClientsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [showInsights, setShowInsights] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: clients, isLoading } = useQuery<ClientData[]>({
    queryKey: ["admin-clients", activeFilter],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/clients?filter=${activeFilter}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: insights, isLoading: insightsLoading } =
    useQuery<InsightsData>({
      queryKey: ["admin-clients-insights"],
      queryFn: async () => {
        const res = await fetch("/api/admin/clients/insights");
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      },
    });

  const creditMutation = useMutation({
    mutationFn: async ({
      userPackageId,
      delta,
    }: {
      userPackageId: string;
      delta: number;
    }) => {
      const res = await fetch(`/api/admin/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPackageId, delta }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] }),
  });

  const filtered = clients?.filter(
    (c) =>
      !searchQuery ||
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            Clientes
          </h1>
          <p className="mt-1 text-muted">
            {clients?.length ?? 0} clientes del estudio
          </p>
        </motion.div>
        <Button
          className="bg-admin text-white hover:bg-admin/90"
          size="sm"
          onClick={() => setShowCreateDialog(true)}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Crear cliente
        </Button>
      </div>

      <CreateClientDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {/* Insights panels */}
      {showInsights && !insightsLoading && insights && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* At-risk panel */}
          {insights.atRisk.length > 0 && (
            <Card className="border-orange-200 bg-orange-50/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    <CardTitle className="text-base text-orange-900">
                      En riesgo de irse
                    </CardTitle>
                    <Badge className="bg-orange-100 text-orange-700">
                      {insights.atRisk.length}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowInsights(false)}
                    className="text-xs text-orange-600"
                  >
                    Ocultar
                  </Button>
                </div>
                <p className="text-xs text-orange-700">
                  Miembros con actividad previa que no asisten hace más de 14
                  días
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2">
                  {insights.atRisk.slice(0, 6).map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2.5"
                    >
                      <MemberAvatar name={m.name} image={m.image} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-orange-900">
                          {m.name ?? m.email}
                        </p>
                        <p className="truncate text-xs text-orange-600">
                          {m.lastClass ?? "Sin historial"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-orange-300 text-orange-700"
                      >
                        {m.daysSinceLastVisit}d
                      </Badge>
                    </div>
                  ))}
                </div>
                {insights.atRisk.length > 6 && (
                  <p className="mt-3 text-center text-xs text-orange-600">
                    y {insights.atRisk.length - 6} más
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Top members */}
          {(insights.topMembers.mostClassesThisMonth.length > 0 ||
            insights.topMembers.mostClassesAllTime.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  <CardTitle className="text-base">
                    Miembros más comprometidos
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-3">
                  {/* This month */}
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 text-accent" />
                      <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                        Este mes
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {insights.topMembers.mostClassesThisMonth.map(
                        (m, i) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-2"
                          >
                            <span className="w-4 text-center text-xs font-bold text-muted">
                              {i + 1}
                            </span>
                            <MemberAvatar
                              name={m.name}
                              image={m.image}
                              size="sm"
                            />
                            <span className="flex-1 truncate text-sm">
                              {m.name ?? "—"}
                            </span>
                            <span className="font-mono text-xs font-semibold text-accent">
                              {m.value}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  {/* All time */}
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-accent" />
                      <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                        Histórico
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {insights.topMembers.mostClassesAllTime.map(
                        (m, i) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-2"
                          >
                            <span className="w-4 text-center text-xs font-bold text-muted">
                              {i + 1}
                            </span>
                            <MemberAvatar
                              name={m.name}
                              image={m.image}
                              size="sm"
                            />
                            <span className="flex-1 truncate text-sm">
                              {m.name ?? "—"}
                            </span>
                            <span className="font-mono text-xs font-semibold text-accent">
                              {m.value}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  {/* Social */}
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <Heart className="h-3.5 w-3.5 text-pink-500" />
                      <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                        Social
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {insights.topMembers.mostSocialActivity.map(
                        (m, i) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-2"
                          >
                            <span className="w-4 text-center text-xs font-bold text-muted">
                              {i + 1}
                            </span>
                            <MemberAvatar
                              name={m.name}
                              image={m.image}
                              size="sm"
                            />
                            <span className="flex-1 truncate text-sm">
                              {m.name ?? "—"}
                            </span>
                            <span className="font-mono text-xs font-semibold text-pink-500">
                              {m.value}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              activeFilter === f.key
                ? "bg-admin text-white"
                : "bg-surface text-muted hover:bg-surface/80",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-10"
          placeholder="Buscar por nombre o email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Client list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : !filtered?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-10 w-10 text-muted/30" />
            <p className="font-medium text-muted">
              No se encontraron clientes
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-2"
        >
          {filtered.map((client) => {
            const expanded = expandedId === client.id;

            return (
              <motion.div key={client.id} variants={fadeUp}>
                <Card
                  className={cn(
                    "transition-shadow",
                    expanded && "shadow-warm-md",
                  )}
                >
                  {/* Main row */}
                  <button
                    className="flex w-full items-center gap-3 p-4 text-left"
                    onClick={() =>
                      setExpandedId(expanded ? null : client.id)
                    }
                  >
                    <MemberAvatar
                      name={client.name}
                      image={client.image}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">
                          {client.name ?? "Sin nombre"}
                        </p>
                        {client.pwaInstalledAt && (
                          <span title="PWA instalada">
                            <Smartphone className="h-3.5 w-3.5 shrink-0 text-accent" />
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted">
                        {client.email}
                      </p>
                    </div>
                    <div className="hidden items-center gap-4 sm:flex">
                      {client.activePackage && (
                        <Badge variant="admin" className="text-xs">
                          {client.activePackage.packageName}
                        </Badge>
                      )}
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold">
                          {client.classesThisMonth}
                        </p>
                        <p className="text-[10px] text-muted">este mes</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold">
                          {client.bookingsCount}
                        </p>
                        <p className="text-[10px] text-muted">total</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted">
                          {client.lastVisited
                            ? timeAgo(client.lastVisited)
                            : "—"}
                        </p>
                      </div>
                    </div>
                    {expanded ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                    )}
                  </button>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <Separator />
                        <div className="grid gap-4 p-4 sm:grid-cols-2">
                          {/* Active package */}
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                              Paquete activo
                            </h4>
                            {client.activePackage ? (
                              <div className="rounded-xl bg-surface p-3">
                                <p className="font-medium">
                                  {client.activePackage.packageName}
                                </p>
                                <div className="mt-1 flex items-center justify-between">
                                  <span className="font-mono text-sm">
                                    {client.activePackage.creditsRemaining ===
                                    -1
                                      ? "Ilimitado"
                                      : `${client.activePackage.creditsRemaining} créditos`}
                                  </span>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() =>
                                        creditMutation.mutate({
                                          userPackageId:
                                            client.activePackage!.id,
                                          delta: -1,
                                        })
                                      }
                                      disabled={creditMutation.isPending}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() =>
                                        creditMutation.mutate({
                                          userPackageId:
                                            client.activePackage!.id,
                                          delta: 1,
                                        })
                                      }
                                      disabled={creditMutation.isPending}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="mt-1 text-xs text-muted">
                                  Expira:{" "}
                                  {formatDate(
                                    client.activePackage.expiresAt,
                                  )}
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm text-muted/60">
                                Sin paquete activo
                              </p>
                            )}
                          </div>

                          {/* Recent bookings + info */}
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                              Últimas reservas
                            </h4>
                            {client.bookingHistory?.length ? (
                              <div className="space-y-1.5">
                                {client.bookingHistory
                                  .slice(0, 4)
                                  .map((b) => (
                                    <div
                                      key={b.id}
                                      className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5"
                                    >
                                      <span className="truncate text-sm">
                                        {b.className}
                                      </span>
                                      <span className="shrink-0 text-xs text-muted">
                                        {formatDate(b.date)}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted/60">
                                Sin reservas recientes
                              </p>
                            )}
                            <div className="mt-3 space-y-1.5">
                              <div className="flex items-center gap-2 text-xs text-muted">
                                <Clock className="h-3 w-3" />
                                Miembro desde{" "}
                                {new Date(
                                  client.memberSince,
                                ).toLocaleDateString("es", {
                                  month: "long",
                                  year: "numeric",
                                })}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted">
                                <Smartphone className="h-3 w-3" />
                                {client.pwaInstalledAt
                                  ? `App instalada el ${new Date(client.pwaInstalledAt).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}`
                                  : "App no instalada"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
