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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { CoachProfileWithUser } from "@/types";

interface CoachWithStats extends CoachProfileWithUser {
  _count?: { classes: number };
  classesThisMonth?: number;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function AdminCoachesPage() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: coaches, isLoading } = useQuery<CoachWithStats[]>({
    queryKey: ["admin-coaches"],
    queryFn: async () => {
      const res = await fetch("/api/coaches");
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Coaches</h1>
          <p className="mt-1 text-muted">Administra el equipo de coaches</p>
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
                  Podrá seguir usando la plataforma como cliente también.
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
                    Enviar invitación
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

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : !coaches?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <UserCog className="h-10 w-10 text-muted/30" />
            <p className="font-medium text-muted">No hay coaches registrados</p>
            <Button
              onClick={() => setShowInvite(true)}
              variant="outline"
              className="mt-2 gap-2"
            >
              <Plus className="h-4 w-4" />
              Invitar primer coach
            </Button>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {coaches.map((coach) => {
            const name = coach.user.name ?? "Coach";
            const initials = (coach.user.name || coach.user.email)
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            const classCount =
              coach.classesThisMonth ?? coach._count?.classes ?? 0;
            const isRemoving = removingId === coach.id;

            return (
              <motion.div key={coach.id} variants={fadeUp}>
                <Card className="group relative transition-shadow hover:shadow-warm-md">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12 ring-2 ring-admin/10">
                        {coach.user.image && (
                          <AvatarImage src={coach.user.image} alt={name} />
                        )}
                        <AvatarFallback className="bg-admin/10 text-sm text-admin">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-display text-base font-bold">
                            {name}
                          </h3>
                          {!coach.user.name && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                              Pendiente
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-sm text-muted">
                          {coach.user.email}
                        </p>
                      </div>

                      {/* Remove button */}
                      {isRemoving ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removeMutation.mutate(coach.id)}
                            disabled={removeMutation.isPending}
                            className="h-7 text-xs"
                          >
                            {removeMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Confirmar"
                            )}
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
                          onClick={() => setRemovingId(coach.id)}
                          className="h-8 w-8 p-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                          title="Remover coach"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {coach.specialties && coach.specialties.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {coach.specialties.slice(0, 3).map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                        {coach.specialties.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{coach.specialties.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-1.5 text-sm text-muted">
                      <CalendarDays className="h-4 w-4" />
                      <span className="font-mono">{classCount}</span>
                      <span>clases este mes</span>
                    </div>
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
