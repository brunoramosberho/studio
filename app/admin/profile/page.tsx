"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Loader2, Check, Camera, UserPen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AvatarCrop } from "@/components/shared/avatar-crop";
import { PhoneInput, isValidPhoneNumber } from "@/components/ui/phone-input";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface ProfileData {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
}

export default function AdminProfilePage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { data: session, update } = useSession();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery<ProfileData>({
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
      setName(profile.name || "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

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
      const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });
      if (res.ok) {
        await update();
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      }
    } catch {
      /* ignore */
    } finally {
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
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        setSaved(true);
        await update();
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      /* ignore */
    }
    setSaving(false);
  }

  const displayImage = avatarPreview || profile?.image || session?.user?.image;
  const displayName = profile?.name || session?.user?.name || "";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("myProfile")}</h1>
        <p className="mt-1 text-muted">{t("profileSubtitle")}</p>
      </motion.div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-6"
        >
          {/* Avatar section */}
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-6">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative"
                disabled={uploadingAvatar}
              >
                <Avatar className="h-24 w-24 ring-4 ring-admin/10">
                  {displayImage && <AvatarImage src={displayImage} />}
                  <AvatarFallback className="bg-admin/10 text-xl text-admin">
                    {initials || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/0 transition-colors group-hover:bg-foreground/40">
                  {uploadingAvatar ? (
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  ) : (
                    <Camera className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
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
              <div className="text-center">
                <p className="font-display text-lg font-bold">{displayName || tc("noName")}</p>
                <p className="text-sm text-muted">{profile?.email || session?.user?.email}</p>
              </div>
            </CardContent>
          </Card>

          {/* Edit form */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserPen className="h-4 w-4 text-admin" />
                {t("personalInfo")}
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    {tc("name")}
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("fullNamePlaceholder")}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    {t("phone")}
                  </label>
                  <div className="mt-1.5">
                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                      defaultCountry="MX"
                      placeholder="55 1234 5678"
                    />
                    {phone && !isValidPhoneNumber(phone) && (
                      <p className="mt-1 text-[11px] text-destructive">
                        {t("invalidPhone")}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    {t("emailLabel")}
                  </label>
                  <Input
                    value={profile?.email || session?.user?.email || ""}
                    disabled
                    className="mt-1.5 opacity-50"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={saving || !name.trim() || (!!phone && !isValidPhoneNumber(phone))}
                  className="w-full gap-2 bg-admin text-white hover:bg-admin/90"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saved ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                  {saved ? tc("saved") : t("saveChanges")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

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
