"use client";

import { useState, useEffect, useRef } from "react";
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
  X,
  MapPin,
  Trophy,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PageTransition } from "@/components/shared/page-transition";
import { AvatarCrop } from "@/components/shared/avatar-crop";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AchievementBadge } from "@/components/feed/achievement-badge";
import { SpotifyTrackPicker, type SpotifyTrack } from "@/components/shared/spotify-track-picker";
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
  spotifyTrackId?: string | null;
  albumArt?: string | null;
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
  instagramUser: string | null;
  stravaUser: string | null;
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

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showSongForm, setShowSongForm] = useState(false);
  const [songPickerKey, setSongPickerKey] = useState(0);
  const [songAddError, setSongAddError] = useState<string | null>(null);

  const [instagramUser, setInstagramUser] = useState("");
  const [stravaUser, setStravaUser] = useState("");

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
      setInstagramUser(profile.instagramUser ?? "");
      setStravaUser(profile.stravaUser ?? "");
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

  const { data: achievements = [] } = useQuery<{ id: string; achievementType: string }[]>({
    queryKey: ["achievements", "me"],
    queryFn: async () => {
      const res = await fetch("/api/achievements/me");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session?.user,
  });

  const addSongMutation = useMutation({
    mutationFn: async (track: SpotifyTrack) => {
      const res = await fetch("/api/profile/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: track.name,
          artist: track.artist,
          spotifyTrackId: track.trackId,
          albumArt: track.albumArt,
          previewUrl: track.previewUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "No se pudo añadir la canción");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "songs"] });
      setSongAddError(null);
      setSongPickerKey((k) => k + 1);
    },
    onError: (err: Error) => {
      setSongAddError(err.message);
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

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCropConfirm(blob: Blob) {
    setAvatarPreview(URL.createObjectURL(blob));
    setUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        await update();
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      }
    } catch {} finally {
      setUploadingAvatar(false);
      setCropSrc(null);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), instagramUser: instagramUser.trim(), stravaUser: stravaUser.trim() }),
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

  const activePackages = packages.filter(
    (p) => new Date(p.expiresAt) > new Date(),
  );
  const soonestPackage = activePackages[0] ?? null;

  const creditsLeft = activePackages.length === 0
    ? 0
    : activePackages.some((p) => p.creditsTotal === null)
      ? -1
      : activePackages.reduce(
          (sum, p) => sum + Math.max(0, (p.creditsTotal ?? 0) - p.creditsUsed),
          0,
        );

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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group relative shrink-0"
            disabled={uploadingAvatar}
          >
            <Avatar className="h-16 w-16">
              <AvatarImage
                src={avatarPreview || session?.user?.image || undefined}
                alt={session?.user?.name ?? ""}
              />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/0 transition-colors group-hover:bg-foreground/40">
              {uploadingAvatar ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </button>
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
                  {soonestPackage && (
                    <p className="mt-0.5 text-[12px] text-muted">
                      {activePackages.length === 1
                        ? `${soonestPackage.package.name} · Expira `
                        : `${activePackages.length} paquetes · Próx. expira `}
                      {new Date(soonestPackage.expiresAt).toLocaleDateString(
                        "es-MX",
                        { day: "numeric", month: "short" },
                      )}
                    </p>
                  )}
                  {!loadingPkgs && !soonestPackage && (
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

        {/* Achievements */}
        {achievements.length > 0 && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
            <div className="rounded-2xl border border-border/50 bg-white p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-accent" />
                <span className="text-[13px] font-semibold text-foreground">
                  Mis logros
                </span>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                  {achievements.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {achievements.map((a) => (
                  <AchievementBadge
                    key={a.id}
                    type={a.achievementType}
                    size="sm"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Favorite songs (collapsible) */}
        <motion.div
          custom={3}
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
                        {song.albumArt ? (
                          <img
                            src={song.albumArt}
                            alt={song.title}
                            className="h-9 w-9 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10">
                            <Music className="h-4 w-4 text-muted" />
                          </div>
                        )}
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
                    {songAddError ? (
                      <p className="mb-3 text-xs text-destructive">{songAddError}</p>
                    ) : null}
                    <SpotifyTrackPicker
                      key={songPickerKey}
                      searchPlaceholder="Busca en Spotify por canción o artista..."
                      confirmLabel="Añadir a favoritos"
                      isSubmitting={addSongMutation.isPending}
                      onSearchInteraction={() => setSongAddError(null)}
                      onConfirm={(track) => addSongMutation.mutateAsync(track)}
                    />
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Quick actions */}
        <motion.div
          className="space-y-1"
          custom={4}
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
                    <div className="space-y-3 rounded-xl bg-surface/50 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                        Redes sociales
                      </p>
                      <div className="flex items-center gap-2">
                        <svg className="h-4.5 w-4.5 shrink-0 text-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                        <Input
                          value={instagramUser}
                          onChange={(e) => setInstagramUser(e.target.value)}
                          placeholder="tu_usuario"
                          className="h-8 text-[13px]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="h-4.5 w-4.5 shrink-0 text-muted" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116zm-3.08-8.399l2.086 4.116h3.065L12.304 3.614v.001l-5.154 10.172h3.066l2.091-4.242zM12.29 0l5.15 10.172h3.065L12.29 0zm0 0l-5.15 10.172H4.075L12.29 0z"/></svg>
                        <Input
                          value={stravaUser}
                          onChange={(e) => setStravaUser(e.target.value)}
                          placeholder="https://strava.app.link/..."
                          className="h-8 text-[13px]"
                        />
                      </div>
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
          <motion.div custom={5} variants={fadeUp} initial="hidden" animate="show">
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
        <motion.div custom={6} variants={fadeUp} initial="hidden" animate="show">
          <Button
            variant="ghost"
            className="w-full justify-center text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={async () => { await signOut({ redirect: false }); window.location.href = window.location.origin; }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </motion.div>
      </div>

      {/* Avatar crop modal */}
      <AvatarCrop
        open={!!cropSrc}
        imageSrc={cropSrc ?? ""}
        onClose={() => setCropSrc(null)}
        onConfirm={handleCropConfirm}
        uploading={uploadingAvatar}
      />
    </PageTransition>
  );
}
