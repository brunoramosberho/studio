"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  LogOut,
  Loader2,
  Check,
  ChevronRight,
  Ticket,
  Package,
  UserPen,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PageTransition } from "@/components/shared/page-transition";
import { cn } from "@/lib/utils";

interface UserPackageInfo {
  id: string;
  creditsTotal: number | null;
  creditsUsed: number;
  expiresAt: string;
  package: { name: string };
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [packages, setPackages] = useState<UserPackageInfo[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(true);

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name ?? "");
    }
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          setPhone(data.phone ?? "");
          if (data.name) setName(data.name);
        }
      } catch {}
    }
    fetchProfile();
  }, [session?.user]);

  useEffect(() => {
    async function fetchPackages() {
      try {
        const res = await fetch("/api/packages/mine");
        if (res.ok) setPackages(await res.json());
      } catch {}
      setLoadingPkgs(false);
    }
    fetchPackages();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      if (res.ok) {
        setSaved(true);
        await update();
        setTimeout(() => {
          setSaved(false);
          setShowEditForm(false);
        }, 1500);
      }
    } catch {}
    setSaving(false);
  }

  const initials = (session?.user?.name ?? "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const activePackage = packages.find(
    (p) => new Date(p.expiresAt) > new Date(),
  );

  const creditsLeft = activePackage
    ? activePackage.creditsTotal === null
      ? -1
      : activePackage.creditsTotal - activePackage.creditsUsed
    : 0;

  return (
    <PageTransition>
      <div className="space-y-5 pb-20">
        {/* Header with avatar */}
        <motion.div
          className="flex items-center gap-4"
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          <Avatar className="h-16 w-16">
            {session?.user?.image && (
              <AvatarImage
                src={session.user.image}
                alt={session.user.name ?? ""}
              />
            )}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-bold text-foreground">
              {session?.user?.name}
            </p>
            <p className="truncate text-sm text-muted">
              {session?.user?.email}
            </p>
          </div>
        </motion.div>

        {/* Credits card */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show">
          <Card className="overflow-hidden border-accent/20 bg-gradient-to-br from-accent/5 to-accent/10">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted">
                    Clases disponibles
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold text-foreground">
                    {loadingPkgs ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted" />
                    ) : creditsLeft === -1 ? (
                      "Ilimitado"
                    ) : (
                      creditsLeft
                    )}
                  </p>
                  {activePackage && (
                    <p className="mt-0.5 text-[12px] text-muted">
                      {activePackage.package.name} · Expira{" "}
                      {new Date(activePackage.expiresAt).toLocaleDateString(
                        "es-MX",
                        { day: "numeric", month: "short" },
                      )}
                    </p>
                  )}
                  {!loadingPkgs && !activePackage && (
                    <p className="mt-0.5 text-[12px] text-muted">
                      Sin paquete activo
                    </p>
                  )}
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
                  <Ticket className="h-6 w-6 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          className="space-y-1"
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          {/* Edit profile */}
          <button
            onClick={() => setShowEditForm(!showEditForm)}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors active:bg-surface"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
              <UserPen className="h-4 w-4 text-foreground" />
            </div>
            <span className="flex-1 text-[15px] font-medium text-foreground">
              Editar perfil
            </span>
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted transition-transform",
                showEditForm && "rotate-90",
              )}
            />
          </button>

          {/* Edit form (collapsible) */}
          {showEditForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Card className="mx-4 mb-2">
                <CardContent className="p-4">
                  <form onSubmit={handleSave} className="space-y-4">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-muted">
                        Nombre
                      </label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Tu nombre completo"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-muted">
                        Teléfono
                      </label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+52 55 1234 5678"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-muted">
                        Correo electrónico
                      </label>
                      <Input
                        value={session?.user?.email ?? ""}
                        disabled
                        className="mt-1.5 opacity-50"
                      />
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={saving || !name.trim()}
                      className="w-full"
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : saved ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : null}
                      {saved ? "Guardado" : "Guardar cambios"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Buy packages */}
          <Link
            href="/packages"
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 transition-colors active:bg-surface"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
              <Package className="h-4 w-4 text-foreground" />
            </div>
            <span className="flex-1 text-[15px] font-medium text-foreground">
              Comprar paquetes
            </span>
            <ChevronRight className="h-4 w-4 text-muted" />
          </Link>

          {/* My packages */}
          <Link
            href="/my/packages"
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 transition-colors active:bg-surface"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
              <ShieldCheck className="h-4 w-4 text-foreground" />
            </div>
            <span className="flex-1 text-[15px] font-medium text-foreground">
              Mis paquetes
            </span>
            <ChevronRight className="h-4 w-4 text-muted" />
          </Link>
        </motion.div>

        <Separator />

        {/* Sign out */}
        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show">
          <Button
            variant="ghost"
            className="w-full justify-center text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </motion.div>
      </div>
    </PageTransition>
  );
}
