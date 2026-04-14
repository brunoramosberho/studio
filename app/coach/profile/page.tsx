"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Save, X, Plus, Loader2, Camera } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AvatarCrop } from "@/components/shared/avatar-crop";
import { useTranslations } from "next-intl";
import type { CoachProfileWithUser } from "@/types";

export default function CoachProfilePage() {
  const t = useTranslations("coach");
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [newSpecialty, setNewSpecialty] = useState("");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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
      setPhotoUrl(profile.photoUrl || profile.user?.image || "");
      setSpecialties(profile.specialties || []);
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/coaches/${session?.user?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio, specialties }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-profile", session?.user?.id] });
      toast.success(t("profileSaved"));
    },
    onError: () => toast.error(t("profileSaveError")),
  });

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCropConfirm(blob: Blob) {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));

      const res = await fetch(`/api/coaches/${session?.user?.id}/avatar`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setPhotoUrl(data.photoUrl);
        queryClient.invalidateQueries({ queryKey: ["coach-profile", session?.user?.id] });
        toast.success(t("photoUpdated"));
      } else {
        toast.error(t("photoUploadError"));
      }
    } catch {
      toast.error(t("photoUploadError"));
    } finally {
      setUploadingAvatar(false);
      setCropSrc(null);
    }
  }

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
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("myProfile")}</h1>
        <p className="mt-1 text-muted">{t("editVisibleInfo")}</p>
      </motion.div>

      {/* Edit form */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t("profileInfo")}</CardTitle>
            <CardDescription>{t("profileInfoDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Photo upload */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                {t("profilePhoto")}
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative shrink-0"
                  disabled={uploadingAvatar}
                >
                  <Avatar className="h-20 w-20 ring-2 ring-coach/20 transition-all group-hover:ring-coach/40">
                    {photoUrl ? (
                      <AvatarImage src={photoUrl} alt={userName} />
                    ) : null}
                    <AvatarFallback className="bg-coach/10 text-lg text-coach">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    {uploadingAvatar ? (
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    ) : (
                      <Camera className="h-5 w-5 text-white" />
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
                <div className="text-sm text-muted">
                  <p>{t("clickToUploadPhoto")}</p>
                  <p className="text-xs text-muted/60">{t("photoFormats")}</p>
                </div>
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                {t("bio")}
              </label>
              <textarea
                className="w-full rounded-xl border border-input-border bg-card p-4 text-sm transition-colors focus:border-coach focus:outline-none focus:ring-1 focus:ring-coach/30"
                rows={5}
                placeholder={t("bioPlaceholder")}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>

            {/* Specialties */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                {t("specialties")}
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
                  placeholder={t("specialtiesPlaceholder")}
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
                {t("saveChanges")}
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
            <CardTitle className="text-base">{t("preview")}</CardTitle>
            <CardDescription>{t("previewDesc")}</CardDescription>
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
                    <span className="text-sm text-muted/50">{t("noSpecialties")}</span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {bio || t("noBioYet")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <AvatarCrop
        open={!!cropSrc}
        imageSrc={cropSrc ?? ""}
        onClose={() => setCropSrc(null)}
        onConfirm={handleCropConfirm}
        uploading={uploadingAvatar}
      />
    </div>
  );
}
