"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, X, Plus, Loader2, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { CoachProfileWithUser } from "@/types";

export default function CoachProfilePage() {
  const { data: session } = useSession();
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [newSpecialty, setNewSpecialty] = useState("");

  const { data: profile, isLoading } = useQuery<CoachProfileWithUser>({
    queryKey: ["coach-profile", session?.user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/coaches/${session?.user?.id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!session?.user?.id,
  });

  useEffect(() => {
    if (profile) {
      setBio(profile.bio || "");
      setPhotoUrl(profile.user.image || "");
      setSpecialties(profile.specialties || []);
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/coaches/${session?.user?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio, photoUrl, specialties }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
  });

  const addSpecialty = () => {
    const trimmed = newSpecialty.trim();
    if (trimmed && !specialties.includes(trimmed)) {
      setSpecialties([...specialties, trimmed]);
      setNewSpecialty("");
    }
  };

  const removeSpecialty = (s: string) => {
    setSpecialties(specialties.filter((sp) => sp !== s));
  };

  const userName = session?.user?.name ?? "Coach";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Mi Perfil</h1>
        <p className="mt-1 text-muted">Edita tu información visible para los clientes</p>
      </motion.div>

      {/* Edit form */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Información del perfil</CardTitle>
            <CardDescription>Estos datos se muestran en la página pública de coaches</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Photo URL */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                URL de foto
              </label>
              <Input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            {/* Bio */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Biografía
              </label>
              <textarea
                className="w-full rounded-xl border border-input-border bg-white p-4 text-sm transition-colors focus:border-coach focus:outline-none focus:ring-1 focus:ring-coach/30"
                rows={5}
                placeholder="Cuéntale a tus alumnos sobre ti..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>

            {/* Specialties */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Especialidades
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {specialties.map((s) => (
                  <Badge
                    key={s}
                    variant="coach"
                    className="gap-1 pr-1"
                  >
                    {s}
                    <button
                      onClick={() => removeSpecialty(s)}
                      className="ml-1 rounded-full p-0.5 hover:bg-coach/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newSpecialty}
                  onChange={(e) => setNewSpecialty(e.target.value)}
                  placeholder="Ej: Reformer, Mat, Prenatal..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSpecialty())}
                />
                <Button variant="ghost" size="icon" onClick={addSpecialty}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex justify-end">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="gap-2 bg-coach hover:bg-coach/90"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar cambios
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Preview */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="border-coach/15">
          <CardHeader>
            <CardTitle className="text-base">Vista previa</CardTitle>
            <CardDescription>Así se ve tu perfil para los clientes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <Avatar className="h-20 w-20 ring-2 ring-coach/20">
                {photoUrl ? (
                  <AvatarImage src={photoUrl} alt={userName} />
                ) : null}
                <AvatarFallback className="bg-coach/10 text-lg text-coach">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 text-center sm:text-left">
                <h3 className="font-display text-xl font-bold">{userName}</h3>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                  {specialties.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">
                      {s}
                    </Badge>
                  ))}
                  {specialties.length === 0 && (
                    <span className="text-sm text-muted/50">Sin especialidades</span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {bio || "Sin biografía aún..."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
