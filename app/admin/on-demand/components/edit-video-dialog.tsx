"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Save, Upload as UploadIcon, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EditVideoDialogProps {
  videoId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

type Level = "ALL" | "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

interface VideoData {
  id: string;
  title: string;
  description: string | null;
  level: Level;
  isFree: boolean;
  thumbnailUrl: string | null;
  cloudflareThumbnailUrl: string | null;
  signedThumbnailUrl: string | null;
  coachProfile: { id: string; name: string } | null;
  classType: { id: string; name: string } | null;
  category: { id: string; name: string; color: string } | null;
}

interface CoachOption {
  id: string;
  name: string;
}
interface ClassTypeOption {
  id: string;
  name: string;
}
interface CategoryOption {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
}

export function EditVideoDialog({
  videoId,
  open,
  onOpenChange,
  onSaved,
}: EditVideoDialogProps) {
  const t = useTranslations("admin.onDemand");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-on-demand-video", videoId],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/admin/on-demand/videos/${videoId}`);
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as { video: VideoData };
    },
  });

  const { data: coaches } = useQuery({
    queryKey: ["coaches-light"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/coaches");
      if (!res.ok) return [];
      return (await res.json()) as CoachOption[];
    },
  });

  const { data: classTypes } = useQuery({
    queryKey: ["class-types-light"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/class-types");
      if (!res.ok) return [];
      return (await res.json()) as ClassTypeOption[];
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["admin-on-demand-categories"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/admin/on-demand/categories");
      if (!res.ok) return { categories: [] as CategoryOption[] };
      return (await res.json()) as { categories: CategoryOption[] };
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editVideo")}</DialogTitle>
        </DialogHeader>

        {isLoading || !data?.video ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : (
          <EditForm
            videoId={videoId}
            initial={data.video}
            coaches={coaches ?? []}
            classTypes={classTypes ?? []}
            categories={categoriesData?.categories ?? []}
            onSaved={onSaved}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  videoId,
  initial,
  coaches,
  classTypes,
  categories,
  onSaved,
  onOpenChange,
}: {
  videoId: string;
  initial: VideoData;
  coaches: CoachOption[];
  classTypes: ClassTypeOption[];
  categories: CategoryOption[];
  onSaved: () => void;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("admin.onDemand");
  const tc = useTranslations("common");

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [coachProfileId, setCoachProfileId] = useState<string>(
    initial.coachProfile?.id ?? "",
  );
  const [classTypeId, setClassTypeId] = useState<string>(initial.classType?.id ?? "");
  const [categoryId, setCategoryId] = useState<string>(initial.category?.id ?? "");
  const [isFree, setIsFree] = useState<boolean>(initial.isFree);
  const [level, setLevel] = useState<Level>(initial.level);
  const [thumbnailUrl, setThumbnailUrl] = useState<string>(initial.thumbnailUrl ?? "");
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const autoThumb = initial.signedThumbnailUrl;
  const previewThumb = thumbnailUrl || autoThumb;

  async function handleThumbUpload(file: File) {
    setThumbError(null);
    setUploadingThumb(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/on-demand/thumbnail", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "upload_failed");
      }
      const { url } = (await res.json()) as { url: string };
      setThumbnailUrl(url);
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : "upload_failed");
    } finally {
      setUploadingThumb(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/on-demand/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          coachProfileId: coachProfileId || null,
          classTypeId: classTypeId || null,
          categoryId: categoryId || null,
          isFree,
          level,
          thumbnailUrl: thumbnailUrl.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
  });

  return (
    <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("titleLabel")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("descriptionLabel")}</Label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("coachLabel")}</Label>
                <Select
                  value={coachProfileId || "__none__"}
                  onValueChange={(v) => setCoachProfileId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("noCoach")}</SelectItem>
                    {(coaches ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("disciplineLabel")}</Label>
                <Select
                  value={classTypeId || "__none__"}
                  onValueChange={(v) => setClassTypeId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("noDiscipline")}</SelectItem>
                    {(classTypes ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("categoryLabel")}</Label>
                <Select
                  value={categoryId || "__none__"}
                  onValueChange={(v) => setCategoryId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("categoryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("noCategory")}</SelectItem>
                    {categories
                      .filter((c) => c.isActive || c.id === categoryId)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("levelLabel")}</Label>
                <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("levelAll")}</SelectItem>
                    <SelectItem value="BEGINNER">{t("levelBeginner")}</SelectItem>
                    <SelectItem value="INTERMEDIATE">{t("levelIntermediate")}</SelectItem>
                    <SelectItem value="ADVANCED">{t("levelAdvanced")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3">
              <div className="min-w-0 flex-1">
                <Label className="text-sm font-semibold">{t("freeLabel")}</Label>
                <p className="mt-0.5 text-xs text-muted">{t("freeHelp")}</p>
              </div>
              <Switch checked={isFree} onCheckedChange={setIsFree} />
            </div>

            <div className="space-y-2">
              <Label>{t("thumbnailLabel")}</Label>
              <div className="flex items-start gap-3">
                <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-foreground/5">
                  {previewThumb ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewThumb}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">
                      —
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleThumbUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={uploadingThumb}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingThumb ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UploadIcon className="h-4 w-4" />
                    )}
                    {thumbnailUrl ? t("thumbnailReplace") : t("thumbnailUpload")}
                  </Button>
                  {thumbnailUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-muted hover:text-foreground"
                      onClick={() => setThumbnailUrl("")}
                    >
                      <X className="h-3.5 w-3.5" />
                      {t("thumbnailUseAuto")}
                    </Button>
                  )}
                  <p className="text-xs text-muted">{t("thumbnailHelp")}</p>
                  {thumbError && (
                    <p className="text-xs text-red-600">{thumbError}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || !title.trim()}
                className="gap-2"
              >
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {tc("save")}
              </Button>
            </div>
    </div>
  );
}
