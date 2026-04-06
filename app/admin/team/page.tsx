"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Plus, Trash2, Mail, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, timeAgo } from "@/lib/utils";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: string;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function AdminTeamPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [confirmUser, setConfirmUser] = useState<{ id: string; name: string | null; email: string } | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  const { data: admins, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-team"],
    queryFn: async () => {
      const res = await fetch("/api/admin/team");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email: emailToInvite, name: nameToSet }: { email: string; name: string }) => {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToInvite, name: nameToSet }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requireConfirm) {
          setConfirmUser(data.existingUser);
          throw new Error(data.error);
        }
        throw new Error(data.error || "Error al invitar");
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-team"] });
      setEmail("");
      setName("");
      setError("");
      setConfirmUser(null);
      setSuccessMsg("Invitación enviada correctamente");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (err: Error) => setError(err.message),
  });

  const promoteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch("/api/admin/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Error al promover");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-team"] });
      setEmail("");
      setError("");
      setConfirmUser(null);
      setSuccessMsg("Usuario promovido a administrador");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch("/api/admin/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al remover");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setConfirmUser(null);
    if (!email.trim() || !name.trim()) return;
    inviteMutation.mutate({ email: email.trim(), name: name.trim() });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Equipo</h1>
        <p className="mt-1 text-muted">Administradores con acceso al panel</p>
      </motion.div>

      {/* Invite form */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Plus className="h-4 w-4 text-admin" />
              Invitar administrador
            </div>
            <form onSubmit={handleInvite} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Nombre completo"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(""); setConfirmUser(null); }}
                  className="flex-1"
                  required
                />
                <Input
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); setConfirmUser(null); }}
                  className="flex-1"
                  required
                />
                <Button
                  type="submit"
                  disabled={inviteMutation.isPending || !name.trim() || !email.trim()}
                  className="gap-2 bg-admin text-white hover:bg-admin/90"
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Invitar
                </Button>
              </div>
            </form>

            <AnimatePresence>
              {error && !confirmUser && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 text-sm text-destructive"
                >
                  {error}
                </motion.p>
              )}

              {confirmUser && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="flex-1">
                      <p className="text-sm text-amber-800">{error}</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => promoteMutation.mutate(confirmUser.id)}
                          disabled={promoteMutation.isPending}
                          className="bg-admin text-white hover:bg-admin/90"
                        >
                          {promoteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sí, hacer admin"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setConfirmUser(null); setError(""); }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {successMsg && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 text-sm font-medium text-green-600"
                >
                  {successMsg}
                </motion.p>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* Admin list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
          {admins?.map((admin) => {
            const name = admin.name || admin.email;
            const initials = (admin.name || admin.email)
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            const isMe = admin.id === session?.user?.id;

            return (
              <motion.div key={admin.id} variants={fadeUp}>
                <Card className={cn("transition-shadow", isMe && "ring-2 ring-admin/20")}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="h-11 w-11 ring-2 ring-admin/10">
                      {admin.image && <AvatarImage src={admin.image} alt={name} />}
                      <AvatarFallback className="bg-admin/10 text-sm text-admin">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-display text-sm font-bold">{name}</h3>
                        {isMe && (
                          <Badge variant="secondary" className="text-[10px]">Tú</Badge>
                        )}
                        {!admin.name && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                            Pendiente
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted">{admin.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="hidden text-xs text-muted sm:block">
                        {timeAgo(admin.createdAt)}
                      </span>
                      {!isMe && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMutation.mutate(admin.id)}
                          disabled={removeMutation.isPending}
                          className="h-8 w-8 p-0 text-muted hover:text-destructive"
                          title="Remover admin"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
