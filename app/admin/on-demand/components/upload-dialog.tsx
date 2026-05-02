"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Upload as UploadIcon, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUploaded: () => void;
}

interface CoachOption {
  id: string;
  name: string;
}

interface ClassTypeOption {
  id: string;
  name: string;
}

type Level = "ALL" | "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export function UploadDialog({ open, onOpenChange, onUploaded }: UploadDialogProps) {
  const t = useTranslations("admin.onDemand");
  const tc = useTranslations("common");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coachProfileId, setCoachProfileId] = useState<string>("");
  const [classTypeId, setClassTypeId] = useState<string>("");
  const [level, setLevel] = useState<Level>("ALL");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadAbort = useRef<{ abort: () => void } | null>(null);

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

  useEffect(() => {
    if (!open) {
      uploadAbort.current?.abort();
      setTitle("");
      setDescription("");
      setCoachProfileId("");
      setClassTypeId("");
      setLevel("ALL");
      setFile(null);
      setProgress(0);
      setUploading(false);
      setError(null);
    }
  }, [open]);

  async function handleUpload() {
    if (!file || !title.trim()) return;
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const initRes = await fetch("/api/admin/on-demand/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          coachProfileId: coachProfileId || null,
          classTypeId: classTypeId || null,
          level,
          fileSize: file.size,
        }),
      });

      if (!initRes.ok) {
        const body = await initRes.json().catch(() => ({}));
        throw new Error(body?.error ?? "init_failed");
      }

      const { uploadURL } = (await initRes.json()) as {
        videoId: string;
        cloudflareStreamUid: string;
        uploadURL: string;
      };

      const tus = await import("tus-js-client");
      const upload = new tus.Upload(file, {
        endpoint: uploadURL,
        uploadUrl: uploadURL,
        chunkSize: 5 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        metadata: {
          name: file.name,
          filetype: file.type,
        },
        onProgress: (sent, total) => {
          setProgress(Math.round((sent / total) * 100));
        },
        onError: (err) => {
          setError(err.message);
          setUploading(false);
        },
        onSuccess: () => {
          setUploading(false);
          onUploaded();
          onOpenChange(false);
        },
      });
      uploadAbort.current = { abort: () => upload.abort() };
      upload.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload_failed");
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("uploadVideo")}</DialogTitle>
          <DialogDescription>{t("uploadDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="up-title">{t("titleLabel")}</Label>
            <Input
              id="up-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={uploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="up-desc">{t("descriptionLabel")}</Label>
            <Textarea
              id="up-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={uploading}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("coachLabel")}</Label>
              <Select
                value={coachProfileId || "__none__"}
                onValueChange={(v) => setCoachProfileId(v === "__none__" ? "" : v)}
                disabled={uploading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("coachPlaceholder")} />
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
                disabled={uploading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("disciplinePlaceholder")} />
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

          <div className="space-y-2">
            <Label>{t("levelLabel")}</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as Level)} disabled={uploading}>
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

          <div className="space-y-2">
            <Label>{t("fileLabel")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="video/*"
                disabled={uploading}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && !uploading && (
                <button
                  onClick={() => setFile(null)}
                  className="rounded p-2 text-muted hover:bg-foreground/5"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-muted">{progress}%</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || !title.trim() || uploading}
              className="gap-2"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadIcon className="h-4 w-4" />
              )}
              {uploading ? t("uploading") : t("startUpload")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
