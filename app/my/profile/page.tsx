"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import {
  LogOut,
  Loader2,
  Check,
  ChevronRight,
  Ticket,
  Package,
  UserPen,
  MapPin,
  Trophy,
  Camera,
  Heart,
  Asterisk,
  CreditCard,
  Gift,
  Copy,
  Users,
  X,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PageTransition } from "@/components/shared/page-transition";
import { AvatarCrop } from "@/components/shared/avatar-crop";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LevelHexCard } from "@/components/profile/level-hex-card";
import { ActivityCalendar } from "@/components/profile/activity-calendar";
import { WearableConnections } from "@/components/profile/wearable-connections";
import { cn } from "@/lib/utils";
import { getLoyaltyTierVisual } from "@/lib/loyalty-tier";
import { PhoneInput, isValidPhoneNumber } from "@/components/ui/phone-input";
import { useBranding } from "@/components/branding-provider";
import { useTranslations } from "next-intl";

interface UserPackageInfo {
  id: string;
  creditsTotal: number | null;
  creditsUsed: number;
  expiresAt: string;
  package: { name: string };
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
  locale: string | null;
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

interface ReferralSheetData {
  code: string;
  shareUrl: string;
  config: {
    isEnabled: boolean;
    referrerRewardText: string | null;
    referrerRewardWhen: string | null;
    refereeRewardText: string | null;
    triggerStage: string;
  } | null;
  stats: { total: number; delivered: number; pending: number };
}

export default function ProfilePage() {
  const t = useTranslations("member");
  const tf = useTranslations("footer");
  const TRIGGER_LABELS: Record<string, string> = {
    installed: t("triggerInstalled"),
    purchased: t("triggerPurchased"),
    booked: t("triggerBooked"),
    attended: t("triggerAttended"),
    member: t("triggerMember"),
  };
  const { data: session, update } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const brand = useBranding();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAllAchievements, setShowAllAchievements] = useState(false);

  const [instagramUser, setInstagramUser] = useState("");
  const [stravaUser, setStravaUser] = useState("");

  const [showReferralSheet, setShowReferralSheet] = useState(false);
  const [referralData, setReferralData] = useState<ReferralSheetData | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [savedLocation, setSavedLocation] = useState(false);

  const [currentLocale, setCurrentLocale] = useState(() =>
    typeof document !== "undefined"
      ? (document.cookie.match(/NEXT_LOCALE=(\w+)/)?.[1] ?? "es")
      : "es"
  );
  const [savingLocale, setSavingLocale] = useState(false);
  const [savedLocale, setSavedLocale] = useState(false);

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
      if (profile.locale && !document.cookie.includes("NEXT_LOCALE=")) {
        document.cookie = `NEXT_LOCALE=${profile.locale}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
        setCurrentLocale(profile.locale);
      }
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

  const { data: studioCityIds = [] } = useQuery<string[]>({
    queryKey: ["studios", "cityIds"],
    queryFn: async () => {
      const res = await fetch("/api/studios");
      if (!res.ok) return [];
      const studios: { cityId: string }[] = await res.json();
      return [...new Set(studios.map((s) => s.cityId))];
    },
  });

  const activeLocations = useMemo(() => {
    if (studioCityIds.length === 0) return [];
    const ids = new Set(studioCityIds);
    return locations
      .map((country) => ({
        ...country,
        cities: country.cities.filter((c) => ids.has(c.id)),
      }))
      .filter((country) => country.cities.length > 0);
  }, [locations, studioCityIds]);

  const activeCityCount = useMemo(
    () => activeLocations.reduce((sum, c) => sum + c.cities.length, 0),
    [activeLocations],
  );

  const { data: achievements = [] } = useQuery<{ id: string; achievementType: string }[]>({
    queryKey: ["achievements", "me"],
    queryFn: async () => {
      const res = await fetch("/api/achievements/me");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session?.user,
  });

  const { data: gamification } = useQuery<{
    hasActiveMembership?: boolean;
    level: { name: string; icon: string; color: string; minClasses: number; sortOrder: number } | null;
    nextLevel: { name: string; icon: string; color: string; minClasses: number; sortOrder: number } | null;
    totalClasses: number;
    classesToNext: number;
    progressPercent: number;
    currentStreak: number;
    longestStreak: number;
    levels: { name: string; icon: string; color: string; minClasses: number; sortOrder: number; reached: boolean; isCurrent: boolean }[];
    achievements: {
      id: string; key: string; name: string; description: string | null;
      icon: string; achievementType: string; earned: boolean; earnedAt: string | null;
    }[];
    rewards: { id: string; rewardKind: string; rewardData: Record<string, unknown>; expiresAt: string | null }[];
  }>({
    queryKey: ["gamification", "me"],
    queryFn: async () => {
      const res = await fetch("/api/gamification/me");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!session?.user,
  });

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

  useEffect(() => {
    if (!profile || activeCityCount !== 1) return;
    const singleCity = activeLocations[0]?.cities[0];
    if (!singleCity || profile.cityId === singleCity.id) return;
    handleLocationChange(activeLocations[0].id, singleCity.id);
  }, [profile, activeCityCount, activeLocations]);

  async function handleLocaleChange(newLocale: string) {
    if (newLocale === currentLocale) return;
    const prev = currentLocale;
    setCurrentLocale(newLocale);
    setSavingLocale(true);
    setSavedLocale(false);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      });
      document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
      setSavedLocale(true);
      setTimeout(() => setSavedLocale(false), 2000);
      router.refresh();
    } catch {
      setCurrentLocale(prev);
    }
    setSavingLocale(false);
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

  const openReferralSheet = useCallback(async () => {
    setShowReferralSheet(true);
    if (referralData) return;
    setReferralLoading(true);
    try {
      const res = await fetch("/api/referrals");
      if (res.ok) setReferralData(await res.json());
    } catch {}
    setReferralLoading(false);
  }, [referralData]);

  const handleCopyLink = useCallback(async () => {
    if (!referralData) return;
    try {
      await navigator.clipboard.writeText(referralData.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [referralData]);

  const handleShareLink = useCallback(async () => {
    if (!referralData || !navigator.share) return;
    try {
      await navigator.share({
        title: `Únete a ${brand.studioName}`,
        text: `Te invito a ${brand.studioName}`,
        url: referralData.shareUrl,
      });
    } catch {}
  }, [referralData, brand.studioName]);

  const profileLevelTier = gamification?.level
    ? getLoyaltyTierVisual(gamification.level.name, gamification.level.sortOrder)
    : null;

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
            <div className="relative" style={{ width: gamification?.hasActiveMembership ? 61 : 72, height: 72 }}>
              <UserAvatar
                user={{
                  image: avatarPreview || session?.user?.image,
                  name: session?.user?.name,
                  hasActiveMembership: gamification?.hasActiveMembership,
                  level: profileLevelTier,
                }}
                size={72}
              />
              {gamification?.hasActiveMembership ? (
                <svg
                  viewBox="0 0 44 52"
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <path
                    d="M6.5,2.5 H37.5 Q41.5,2.5 41.5,6.5 V28 Q41.5,42 22,49.5 Q2.5,42 2.5,28 V6.5 Q2.5,2.5 6.5,2.5 Z"
                    fill="rgba(0,0,0,0.4)"
                  />
                  <text x="22" y="26" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="10" opacity="0.9">
                    📷
                  </text>
                </svg>
              ) : (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-foreground/0 transition-colors group-hover:bg-foreground/40"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <Camera className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </div>
              )}
              {uploadingAvatar && gamification?.hasActiveMembership && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
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

        {/* Credits card — taps through to /my/packages */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show">
          <Link href="/my/packages" className="block">
            <Card className="overflow-hidden border-accent/20 bg-gradient-to-br from-accent/5 to-accent/10 transition-shadow active:shadow-none">
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
          </Link>
        </motion.div>

        {/* Level: hex badge + progress (expandable) */}
        {gamification?.level && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
            <LevelHexCard
              level={gamification.level}
              nextLevel={gamification.nextLevel}
              totalClasses={gamification.totalClasses}
              classesToNext={gamification.classesToNext}
              levels={gamification.levels}
            />
          </motion.div>
        )}

        {/* Activity calendar — Strava style */}
        <motion.div custom={2.5} variants={fadeUp} initial="hidden" animate="show">
          <ActivityCalendar />
        </motion.div>

        {/* Achievements */}
        {gamification && gamification.achievements.length > 0 && (() => {
          const earned = gamification.achievements.filter((a) => a.earned);
          const locked = gamification.achievements.filter((a) => !a.earned);
          return (
            <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show">
              <div className="rounded-2xl border border-border/50 bg-white p-4">
                <button
                  onClick={() => setShowAllAchievements(!showAllAchievements)}
                  className="flex w-full items-center gap-2"
                >
                  <Trophy className="h-4 w-4 text-accent" />
                  <span className="text-[13px] font-semibold text-foreground">
                    Logros
                  </span>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    {earned.length}/{gamification.achievements.length}
                  </span>
                  <ChevronRight
                    className={cn(
                      "ml-auto h-4 w-4 text-muted transition-transform",
                      showAllAchievements && "rotate-90",
                    )}
                  />
                </button>

                {/* Compact: horizontal scroll of earned badges */}
                {!showAllAchievements && earned.length > 0 && (
                  <div className="mt-2.5 flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {earned.map((a) => (
                      <div key={a.id} className="flex flex-col items-center gap-0.5">
                        <span className="text-xl">{a.icon}</span>
                        <span className="whitespace-nowrap text-[9px] font-medium text-muted">
                          {a.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Expanded: full grid */}
                {showAllAchievements && (
                  <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                    {earned.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-col items-center gap-0.5 rounded-lg bg-surface px-1.5 py-2 text-center"
                      >
                        <span className="text-lg">{a.icon}</span>
                        <span className="text-[9px] font-semibold leading-tight text-foreground">
                          {a.name}
                        </span>
                        {a.earnedAt && (
                          <span className="text-[8px] text-muted">
                            {new Date(a.earnedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    ))}
                    {locked.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-col items-center gap-0.5 rounded-lg bg-surface/40 px-1.5 py-2 text-center opacity-35 grayscale"
                      >
                        <span className="text-lg">{a.icon}</span>
                        <span className="text-[9px] font-semibold leading-tight text-foreground">
                          {a.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })()}

        {/* Quick actions */}
        <motion.div
          custom={3.5}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          <div className="divide-y divide-border/40 rounded-2xl border border-border/50 bg-white">
            {/* Invite a friend — first item */}
            <button
              onClick={openReferralSheet}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface/50"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: `${brand.colorAccent}15` }}
              >
                <Gift className="h-4 w-4" style={{ color: brand.colorAccent }} />
              </div>
              <span className="flex-1 text-[15px] font-medium text-foreground">
                Invita a un amigo
              </span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </button>

            {/* Edit profile */}
            <div>
              <button
                onClick={() => setShowEditForm(!showEditForm)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface/50"
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
                  <div className="px-4 pb-4">
                    <Card>
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
                            <div className="mt-1.5">
                              <PhoneInput
                                value={phone}
                                onChange={setPhone}
                                defaultCountry="ES"
                                placeholder="612 345 678"
                              />
                              {phone && !isValidPhoneNumber(phone) && (
                                <p className="mt-1 text-[11px] text-destructive">
                                  Número de teléfono inválido
                                </p>
                              )}
                            </div>
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
                            disabled={saving || !name.trim() || (!!phone && !isValidPhoneNumber(phone))}
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
                  </div>
                </motion.div>
              )}
            </div>

            <Link
              href="/my/payment-methods"
              className="flex w-full items-center gap-3 px-4 py-3 transition-colors active:bg-surface/50"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
                <CreditCard className="h-4 w-4 text-foreground" />
              </div>
              <span className="flex-1 text-[15px] font-medium text-foreground">
                Métodos de pago
              </span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>

            <Link
              href="/packages"
              className="flex w-full items-center gap-3 px-4 py-3 transition-colors active:bg-surface/50"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
                <Package className="h-4 w-4 text-foreground" />
              </div>
              <span className="flex-1 text-[15px] font-medium text-foreground">
                Comprar paquetes
              </span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>

            {/* Connected apps / Wearables */}
            <div>
              <WearableConnections grouped />
            </div>
          </div>
        </motion.div>

        {/* Active rewards */}
        {gamification && gamification.rewards.length > 0 && (
          <motion.div custom={4.5} variants={fadeUp} initial="hidden" animate="show">
            <div className="rounded-2xl border border-border/50 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Package className="h-4 w-4 text-accent" />
                <span className="text-[13px] font-semibold text-foreground">
                  Mis premios
                </span>
              </div>
              <div className="space-y-2">
                {gamification.rewards.map((r) => {
                    const data = r.rewardData as { text?: string };
                    return (
                      <div key={r.id} className="flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2.5">
                        <span className="text-lg">🎁</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-amber-800">
                            {data.text ?? "Premio especial"}
                          </p>
                          <p className="text-[11px] text-amber-600">De tu estudio</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </motion.div>
        )}

        <Separator />

        {/* Location — only shown when tenant has studios in multiple cities */}
        {activeCityCount > 1 && (
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
                  {activeLocations.map((country) =>
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

        {/* Language */}
        <motion.div custom={5.5} variants={fadeUp} initial="hidden" animate="show">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Globe className="h-3.5 w-3.5" />
              <span>{t("language")}</span>
            </div>
            <div className="relative ml-auto">
              <select
                value={currentLocale}
                onChange={(e) => handleLocaleChange(e.target.value)}
                disabled={savingLocale}
                className="appearance-none rounded-full border border-border/60 bg-white py-1.5 pl-3 pr-7 text-[13px] font-medium text-foreground focus:border-accent focus:outline-none"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
              {savingLocale ? (
                <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted" />
              ) : savedLocale ? (
                <Check className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-green-500" />
              ) : (
                <ChevronRight className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-muted" />
              )}
            </div>
          </div>
        </motion.div>

        {/* Sign out */}
        <motion.div custom={6} variants={fadeUp} initial="hidden" animate="show">
          <Button
            variant="ghost"
            className="w-full justify-center text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={async () => { await signOut({ redirect: false }); window.location.href = window.location.origin; }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("logout")}
          </Button>
        </motion.div>

        {/* Footer */}
        <motion.p
          custom={7}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="pt-6 text-center text-xs text-muted/60"
        >
          {tf("madeWithLove")} <Heart className="inline h-3 w-3 fill-current text-red-400" /> {tf("forYou")}{" "}
          {session?.user?.name?.split(" ")[0] ?? tf("you")}
        </motion.p>
        <motion.div
          custom={8}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="flex items-center justify-center gap-1 pb-2 pt-1 text-[10px] text-muted/40"
        >
          {tf("developedBy")}
          <a
            href="https://mgic.app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-muted/50 transition-colors hover:text-muted"
          >
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] bg-current">
              <Asterisk className="h-2.5 w-2.5 text-white" strokeWidth={3} />
            </span>
            Magic Studio
          </a>
        </motion.div>
      </div>

      {/* Referral bottom sheet */}
      <ReferralSheet
        open={showReferralSheet}
        onClose={() => setShowReferralSheet(false)}
        data={referralData}
        loading={referralLoading}
        copied={copied}
        onCopy={handleCopyLink}
        onShare={handleShareLink}
        onViewAll={() => {
          setShowReferralSheet(false);
          router.push("/my/referrals");
        }}
        brand={brand}
      />

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

/* ── iOS-style Share Icon ── */

function IosShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
    </svg>
  );
}

/* ── Referral Bottom Sheet ── */

function ReferralSheet({
  open,
  onClose,
  data,
  loading,
  copied,
  onCopy,
  onShare,
  onViewAll,
  brand,
}: {
  open: boolean;
  onClose: () => void;
  data: ReferralSheetData | null;
  loading: boolean;
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
  onViewAll: () => void;
  brand: ReturnType<typeof useBranding>;
}) {
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [0, 300], [1, 0]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (info.offset.y > 120 || info.velocity.y > 400) onClose();
      dragY.set(0);
    },
    [onClose, dragY],
  );

  const config = data?.config;
  const hasRewards = config?.isEnabled && (config.refereeRewardText || config.referrerRewardText);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            style={{ opacity: backdropOpacity }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.8 }}
            onDrag={(_, info) => dragY.set(Math.max(0, info.offset.y))}
            onDragEnd={handleDragEnd}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl bg-white"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-border/60" />
            </div>

            <div className="overflow-y-auto px-5 pb-8">
              {/* Header */}
              <div className="flex items-center justify-between py-3">
                <h2 className="font-display text-lg font-bold text-foreground">
                  Invita a un amigo
                </h2>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted active:bg-surface"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted" />
                </div>
              ) : !data ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-muted">No se pudo cargar</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Share URL — tappable to copy */}
                  <button
                    onClick={onCopy}
                    className="w-full rounded-2xl border border-border/50 bg-surface/50 p-3 text-left transition-colors active:bg-surface"
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Tu link personal
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
                        {copied ? (
                          <>
                            <Check className="h-3 w-3 text-green-500" />
                            <span className="text-green-600">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copiar
                          </>
                        )}
                      </span>
                    </div>
                    <p className="truncate font-mono text-[13px] text-foreground/70">
                      {data.shareUrl}
                    </p>
                  </button>

                  {/* Rewards — only shown when program is active and has reward text */}
                  {hasRewards && (
                    <div className="space-y-2">
                      {config.refereeRewardText && (
                        <div className="flex items-start gap-3 rounded-2xl bg-surface/50 p-3.5">
                          <div
                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                            style={{ background: `${brand.colorAccent}15` }}
                          >
                            <Gift className="h-4 w-4" style={{ color: brand.colorAccent }} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                              Tu amigo recibe
                            </p>
                            <p className="mt-0.5 text-[14px] font-semibold text-foreground">
                              {config.refereeRewardText}
                            </p>
                          </div>
                        </div>
                      )}
                      {config.referrerRewardText && (
                        <div className="flex items-start gap-3 rounded-2xl bg-surface/50 p-3.5">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                            <Trophy className="h-4 w-4 text-foreground/60" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                              Tú recibes
                              {config.triggerStage
                                ? ` · cuando ${TRIGGER_LABELS[config.triggerStage] ?? "complete el paso"}`
                                : ""}
                            </p>
                            <p className="mt-0.5 text-[14px] font-semibold text-foreground">
                              {config.referrerRewardText}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={onShare}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white transition-opacity active:opacity-80"
                      style={{ background: brand.colorAccent }}
                    >
                      <IosShareIcon className="h-[18px] w-[18px]" />
                      Compartir
                    </button>
                    <button
                      onClick={onCopy}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-white px-5 py-3.5 text-[15px] font-medium text-foreground transition-colors active:bg-surface"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  </div>

                  {/* Stats / link to full dashboard */}
                  {config?.isEnabled && (
                    <button
                      onClick={onViewAll}
                      className="flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-white p-4 text-left transition-colors active:bg-surface/50"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
                        <Users className="h-4.5 w-4.5 text-foreground/70" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-foreground">
                          {data.stats.total === 0
                            ? "Aún no has invitado a nadie"
                            : `${data.stats.total} amigo${data.stats.total !== 1 ? "s" : ""} invitado${data.stats.total !== 1 ? "s" : ""}`}
                        </p>
                        <p className="text-[12px] text-muted">
                          {data.stats.total === 0
                            ? "Comparte tu link para empezar"
                            : "Ver detalles y progreso"}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
