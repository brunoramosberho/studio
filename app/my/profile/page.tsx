"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion } from "framer-motion";
import { LogOut, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PageTransition } from "@/components/shared/page-transition";

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
      } catch {
        /* silently fail */
      }
    }
    fetchProfile();
  }, [session?.user]);

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
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      /* silently fail */
    } finally {
      setSaving(false);
    }
  }

  const initials = (session?.user?.name ?? "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Perfil
        </h1>

        {/* Avatar section */}
        <motion.div
          className="flex items-center gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" as const }}
        >
          <Avatar className="h-20 w-20">
            {session?.user?.image && (
              <AvatarImage src={session.user.image} alt={session.user.name ?? ""} />
            )}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-display text-lg font-bold text-foreground">
              {session?.user?.name}
            </p>
            <p className="text-sm text-muted">{session?.user?.email}</p>
          </div>
        </motion.div>

        {/* Edit form */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" as const }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Información personal</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    Nombre
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre completo"
                    className="mt-2"
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
                    className="mt-2"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    Correo electrónico
                  </label>
                  <Input
                    value={session?.user?.email ?? ""}
                    disabled
                    className="mt-2 opacity-60"
                  />
                </div>

                <Button type="submit" disabled={saving || !name.trim()}>
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

        <Separator />

        {/* Sign out */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2, ease: "easeOut" as const }}
        >
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
