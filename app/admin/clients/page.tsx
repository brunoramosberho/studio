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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn, formatDate, timeAgo } from "@/lib/utils";

interface ClientData {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  activePackage?: {
    id: string;
    packageName: string;
    creditsRemaining: number;
    expiresAt: string;
  } | null;
  bookingsCount: number;
  lastVisited: string | null;
  packageHistory?: { id: string; packageName: string; purchasedAt: string; creditsRemaining: number }[];
  bookingHistory?: { id: string; className: string; date: string; status: string }[];
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function AdminClientsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: clients, isLoading } = useQuery<ClientData[]>({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const res = await fetch("/api/admin/clients");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const creditMutation = useMutation({
    mutationFn: async ({ userPackageId, delta }: { userPackageId: string; delta: number }) => {
      const res = await fetch(`/api/admin/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPackageId, delta }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-clients"] }),
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
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Clientes</h1>
          <p className="mt-1 text-muted">Directorio de clientes del estudio</p>
        </motion.div>
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
            <p className="font-medium text-muted">No se encontraron clientes</p>
          </CardContent>
        </Card>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
          {filtered.map((client) => {
            const expanded = expandedId === client.id;
            const initials = (client.name ?? "U")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2);

            return (
              <motion.div key={client.id} variants={fadeUp}>
                <Card className={cn("transition-shadow", expanded && "shadow-warm-md")}>
                  {/* Main row */}
                  <button
                    className="flex w-full items-center gap-3 p-4 text-left"
                    onClick={() => setExpandedId(expanded ? null : client.id)}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-admin/10">
                      <span className="text-sm font-semibold text-admin">{initials}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {client.name ?? "Sin nombre"}
                      </p>
                      <p className="truncate text-xs text-muted">{client.email}</p>
                    </div>
                    <div className="hidden items-center gap-4 sm:flex">
                      {client.activePackage && (
                        <Badge variant="admin" className="text-xs">
                          {client.activePackage.packageName}
                        </Badge>
                      )}
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold">
                          {client.bookingsCount}
                        </p>
                        <p className="text-[10px] text-muted">reservas</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted">
                          {client.lastVisited ? timeAgo(client.lastVisited) : "—"}
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
                            <h4 className="mb-2 text-xs font-semibold text-muted uppercase tracking-wide">
                              Paquete activo
                            </h4>
                            {client.activePackage ? (
                              <div className="rounded-xl bg-surface p-3">
                                <p className="font-medium">{client.activePackage.packageName}</p>
                                <div className="mt-1 flex items-center justify-between">
                                  <span className="font-mono text-sm">
                                    {client.activePackage.creditsRemaining} créditos
                                  </span>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() =>
                                        creditMutation.mutate({
                                          userPackageId: client.activePackage!.id,
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
                                          userPackageId: client.activePackage!.id,
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
                                  Expira: {formatDate(client.activePackage.expiresAt)}
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm text-muted/60">Sin paquete activo</p>
                            )}
                          </div>

                          {/* Recent bookings */}
                          <div>
                            <h4 className="mb-2 text-xs font-semibold text-muted uppercase tracking-wide">
                              Últimas reservas
                            </h4>
                            {client.bookingHistory?.length ? (
                              <div className="space-y-1.5">
                                {client.bookingHistory.slice(0, 4).map((b) => (
                                  <div
                                    key={b.id}
                                    className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5"
                                  >
                                    <span className="truncate text-sm">{b.className}</span>
                                    <span className="shrink-0 text-xs text-muted">
                                      {formatDate(b.date)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted/60">Sin reservas recientes</p>
                            )}
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
