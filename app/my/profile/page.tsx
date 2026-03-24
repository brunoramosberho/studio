"use client";

import { useState, useEffect } from "react";
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
  Music,
  Plus,
  X,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PageTransition } from "@/components/shared/page-transition";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface UserPackageInfo {
  id: string;
  creditsTotal: number | null;
  creditsUsed: number;
  expiresAt: string;
  package: { name: string };
}

interface FavoriteSong {
  id: string;
  title: string;
  artist: string;
}

interface LocationCountry {
  id: string;
  name: string;
  code: string;
  cities: { id: string; name: string }[];
}

interface ProfileData {
  name: string;
  phone: string | null;
  countryId: string | null;
  cityId: string | null;
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
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const [showSongForm, setShowSongForm] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");

  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [savedLocation, setSavedLocation] = useState(false);

  const { data: profile } = useQuery<ProfileData>({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!session?.user,
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || session?.user?.name || "");
      setPhone(profile.phone ?? "");
      if (profile.countryId) setSelectedCountry(profile.countryId);
      if (profile.cityId) setSelectedCity(profile.cityId);
    } else if (session?.user?.name) {
      setName(session.user.name);
    }
  }, [profile, session?.user?.name]);

  const { data: packages = [], isLoading: loadingPkgs } = useQuery<UserPackageInfo[]>({
    queryKey: ["packages", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/packages/mine");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session?.user,
  });

  const { data: locations = [] } = useQuery<LocationCountry[]>({
    queryKey: ["locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: songs = [], isLoading: loadingSongs } = useQuery<FavoriteSong[]>({
    queryKey: ["profile", "songs"],
    queryFn: async () => {
      const res = await fetch("/api/profile/songs");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session?.user,
  });

  const addSongMutation = useMutation({
    mutationFn: async ({ title, artist }: { title: string; artist: string }) => {
      const res = await fetch("/api/profile/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, artist }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "songs"] });
      setSongTitle("");
      setSongArtist("");
      setShowSongForm(false);
    },
  });

  const removeSongMutation = useMutation({
    mutationFn: async (songId: string) => {
      await fetch(`/api/profile/songs?id=${songId}`, { method: "DELETE" });
    },
    onMutate: async (songId) => {
      await queryClient.cancelQueries({ queryKey: ["profile", "songs"] });
      const prev = queryClient.getQueryData<FavoriteSong[]>(["profile", "songs"]);
      queryClient.setQueryData<FavoriteSong[]>(["profile", "songs"], (old) =>
        old?.filter((s) => s.id !== songId) ?? [],
      );
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData(["profile", "songs"], context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "songs"] });
    },
  });

  function handleAddSong(e: React.FormEvent) {
    e.preventDefault();
    if (!songTitle.trim() || !songArtist.trim()) return;
    addSongMutation.mutate({ title: songTitle.trim(), artist: songArtist.trim() });
  }

  function handleRemoveSong(songId: string) {
    removeSongMutation.mutate(songId);
  }

  function countryFlag(code: string) {
    return code
      .toUpperCase()
      .split("")
      .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
      .join("");
  }

  async function handleLocationChange(countryId: string, cityId: string) {
    setSelectedCountry(countryId);
    setSelectedCity(cityId);
    setSavingLocation(true);
    setSavedLocation(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId: countryId || null, cityId: cityId || null }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        setSavedLocation(true);
        setTimeout(() => setSavedLocation(false), 2000);
      }
    } catch {}
    setSavingLocation(false);
  }

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
        queryClient.invalidateQueries({ queryKey: ["profile"] });
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

        {/* Favorite songs (collapsible) */}
        <motion.div
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          <button
            onClick={() => setShowSongForm(!showSongForm)}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors active:bg-surface"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
              <Music className="h-4 w-4 text-accent" />
            </div>
            <span className="flex-1 text-[15px] font-medium text-foreground">
              Mis canciones favoritas
            </span>
            {!loadingSongs && songs.length > 0 && (
              <span className="mr-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent/10 px-1.5 text-[11px] font-semibold text-accent">
                {songs.length}
              </span>
            )}
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted transition-transform",
                showSongForm && "rotate-90",
              )}
            />
          </button>

          {showSongForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-2 pt-1 space-y-3">
                <p className="text-xs text-muted">
                  Tus coaches verán estas canciones para personalizar la clase
                </p>

                {loadingSongs ? (
                  <div className="flex justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted" />
                  </div>
                ) : songs.length > 0 ? (
                  <div className="space-y-1">
                    {songs.map((song) => (
                      <div
                        key={song.id}
                        className="flex items-center gap-2.5 rounded-lg bg-surface/60 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {song.title}
                          </p>
                          <p className="truncate text-[11px] text-muted">{song.artist}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveSong(song.id); }}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <Card>
                  <CardContent className="p-3">
                    <form onSubmit={handleAddSong} className="flex items-center gap-2">
                      <Input
                        value={songTitle}
                        onChange={(e) => setSongTitle(e.target.value)}
                        placeholder="Canción"
                        className="h-9 text-[14px]"
                      />
                      <Input
                        value={songArtist}
                        onChange={(e) => setSongArtist(e.target.value)}
                        placeholder="Artista"
                        className="h-9 text-[14px]"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={addSongMutation.isPending || !songTitle.trim() || !songArtist.trim()}
                        className="h-9 shrink-0 px-3"
                      >
                        {addSongMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Quick actions */}
        <motion.div
          className="space-y-1"
          custom={3}
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

        {/* Location — minimal single dropdown */}
        {locations.length > 0 && (
          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="show">
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="flex items-center gap-2 text-[13px] text-muted">
                <MapPin className="h-3.5 w-3.5" />
                <span>Ubicación</span>
              </div>
              <div className="relative ml-auto">
                <select
                  value={selectedCity ? `${selectedCountry}|${selectedCity}` : ""}
                  onChange={(e) => {
                    const [cId, cityId] = e.target.value.split("|");
                    handleLocationChange(cId || "", cityId || "");
                  }}
                  className="appearance-none rounded-full border border-border/60 bg-white py-1.5 pl-3 pr-7 text-[13px] font-medium text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">Seleccionar</option>
                  {locations.map((country) =>
                    country.cities.map((city) => (
                      <option key={city.id} value={`${country.id}|${city.id}`}>
                        {countryFlag(country.code)} {city.name}
                      </option>
                    )),
                  )}
                </select>
                {savingLocation ? (
                  <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted" />
                ) : savedLocation ? (
                  <Check className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-green-500" />
                ) : (
                  <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted" />
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Sign out */}
        <motion.div custom={5} variants={fadeUp} initial="hidden" animate="show">
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
