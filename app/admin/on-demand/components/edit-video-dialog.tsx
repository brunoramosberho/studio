"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Save } from "lucide-react";
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
  thumbnailUrl: string | null;
  cloudflareThumbnailUrl: string | null;
  coachProfile: { id: string; name: string } | null;
  classType: { id: string; name: string } | null;
}

interface CoachOption {
  id: string;
  name: string;
}
interface ClassTypeOption {
  id: string;
  name: string;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
  onSaved,
  onOpenChange,
}: {
  videoId: string;
  initial: VideoData;
  coaches: CoachOption[];
  classTypes: ClassTypeOption[];
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
  const [level, setLevel] = useState<Level>(initial.level);
  const [thumbnailUrl, setThumbnailUrl] = useState<string>(initial.thumbnailUrl ?? "");

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
            <div className="space-y-2">
              <Label>{t("thumbnailUrlLabel")}</Label>
              <Input
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://..."
              />
              <p className="text-xs text-muted">{t("thumbnailUrlHelp")}</p>
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
