"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { motion, Reorder } from "framer-motion";
import {
  ImagePlus,
  Trash2,
  Pencil,
  GripVertical,
  Plus,
  ExternalLink,
  Link2,
  Eye,
  EyeOff,
  Loader2,
  MousePointerClick,
  X,
  Upload,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface HighlightItem {
  id: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string;
  isExternal: boolean;
  position: number;
  isActive: boolean;
  createdAt: string;
  _count: { clicks: number };
}

interface HighlightsData {
  highlights: HighlightItem[];
  highlightsEnabled: boolean;
}

function useHighlights() {
  return useQuery<HighlightsData>({
    queryKey: ["admin-highlights"],
    queryFn: () =>
      fetch("/api/admin/marketing/highlights").then((r) => r.json()),
  });
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-emerald-500" : "bg-stone-300",
        disabled && "opacity-50",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

const TARGET_W = 600;
const TARGET_H = 750;
const MAX_QUALITY = 0.82;

function cropAndCompress(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const srcRatio = img.width / img.height;
      const targetRatio = TARGET_W / TARGET_H;

      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcRatio > targetRatio) {
        sw = Math.round(img.height * targetRatio);
        sx = Math.round((img.width - sw) / 2);
      } else {
        sh = Math.round(img.width / targetRatio);
        sy = Math.round((img.height - sh) / 2);
      }

      const canvas = document.createElement("canvas");
      canvas.width = TARGET_W;
      canvas.height = TARGET_H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_W, TARGET_H);

      const useWebp = canvas.toDataURL("image/webp").startsWith("data:image/webp");
      const mime = useWebp ? "image/webp" : "image/jpeg";

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
        mime,
        MAX_QUALITY,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

function ImageUploader({
  currentUrl,
  onUpload,
}: {
  currentUrl?: string;
  onUpload: (url: string) => void;
}) {
  const t = useTranslations("admin");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      setPreview(URL.createObjectURL(file));
      try {
        const blob = await cropAndCompress(file);
        const ext = blob.type === "image/webp" ? "webp" : "jpg";
        const processed = new File([blob], `highlight.${ext}`, { type: blob.type });

        const form = new FormData();
        form.append("file", processed);
        const res = await fetch("/api/admin/marketing/highlights/upload", {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok || !data.url) {
          throw new Error(data.error || `Upload failed (${res.status})`);
        }
        onUpload(data.url);
        setPreview(data.url);
      } catch (e) {
        setPreview(currentUrl || null);
        setError(e instanceof Error ? e.message : "Upload error");
      }
      setUploading(false);
    },
    [currentUrl, onUpload],
  );

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="group relative aspect-[4/5] w-full max-w-[260px] overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 transition-colors hover:border-stone-400"
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Preview"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Upload className="h-6 w-6 text-white" />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-8 w-8" />
                <span className="text-xs font-medium">{t("hlUploadImage")}</span>
                <span className="text-[10px]">
                  Se recorta a {TARGET_W}×{TARGET_H}px (4:5)
                </span>
              </>
            )}
          </div>
        )}
      </button>
      {error && (
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      )}
      <p className="mt-1.5 text-[10px] text-stone-400">
        {t("hlImageCropHint", { width: TARGET_W, height: TARGET_H })}
      </p>
    </div>
  );
}

function HighlightForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<HighlightItem>;
  onSave: (data: {
    title: string;
    subtitle: string;
    imageUrl: string;
    linkUrl: string;
    isExternal: boolean;
  }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [title, setTitle] = useState(initial?.title || "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle || "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl || "");
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl || "");
  const [isExternal, setIsExternal] = useState(initial?.isExternal ?? false);

  const isValid = imageUrl && linkUrl.trim();

  return (
    <div className="space-y-4">
      <ImageUploader currentUrl={imageUrl} onUpload={setImageUrl} />

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600">
          {t("titleLabel")}{" "}
          <span className="text-stone-400">({t("optionalLabel")})</span>
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("hlTitlePlaceholder")}
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600">
          {t("hlSubtitleLabel")}{" "}
          <span className="text-stone-400">({t("optionalLabel")})</span>
        </label>
        <input
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder={t("hlSubtitlePlaceholder")}
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600">
          {t("hlDestinationLink")}
        </label>
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="Ej: /schedule o https://example.com"
          className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-stone-600">
        <input
          type="checkbox"
          checked={isExternal}
          onChange={(e) => setIsExternal(e.target.checked)}
          className="rounded border-stone-300"
        />
        {t("hlExternalLink")}
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100"
        >
          {tc("cancel")}
        </button>
        <button
          type="button"
          disabled={!isValid || saving}
          onClick={() =>
            onSave({ title, subtitle, imageUrl, linkUrl, isExternal })
          }
          className="flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:bg-stone-300 disabled:text-stone-500"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {initial?.id ? tc("save") : tc("create")}
        </button>
      </div>
    </div>
  );
}

function HighlightCard({
  item,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: HighlightItem;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("admin");
  return (
    <Reorder.Item
      value={item}
      className="group flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm"
    >
      <GripVertical className="mt-3 h-4 w-4 shrink-0 cursor-grab text-stone-300 active:cursor-grabbing" />

      <div className="relative aspect-[16/9] w-28 shrink-0 overflow-hidden rounded-lg bg-stone-100">
        <img
          src={item.imageUrl}
          alt={item.title || ""}
          className="h-full w-full object-cover"
        />
        {!item.isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <EyeOff className="h-4 w-4 text-white" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-stone-900">
              {item.title || <span className="italic text-stone-400">{t("hlNoTitle")}</span>}
            </p>
            {item.subtitle && (
              <p className="truncate text-xs text-stone-500">
                {item.subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onEdit}
              className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onToggle}
              className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >
              {item.isActive ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={onDelete}
              className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-stone-400">
          <span className="flex items-center gap-1">
            {item.isExternal ? (
              <ExternalLink className="h-3 w-3" />
            ) : (
              <Link2 className="h-3 w-3" />
            )}
            <span className="max-w-[160px] truncate font-mono">
              {item.linkUrl}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <MousePointerClick className="h-3 w-3" />
            {item._count.clicks} clicks
          </span>
        </div>
      </div>
    </Reorder.Item>
  );
}

export default function HighlightsPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { data, isLoading } = useHighlights();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HighlightItem | null>(null);

  const toggleSection = useMutation({
    mutationFn: (enabled: boolean) =>
      fetch("/api/admin/marketing/highlights/toggle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-highlights"] }),
  });

  const createHighlight = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/admin/marketing/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-highlights"] });
      setDialogOpen(false);
    },
  });

  const updateHighlight = useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown>) =>
      fetch(`/api/admin/marketing/highlights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-highlights"] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteHighlight = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/marketing/highlights/${id}`, {
        method: "DELETE",
      }).then((r) => r.json()),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin-highlights"] }),
  });

  const reorder = useMutation({
    mutationFn: async (items: HighlightItem[]) => {
      await Promise.all(
        items.map((item, i) =>
          fetch(`/api/admin/marketing/highlights/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position: i }),
          }),
        ),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin-highlights"] }),
  });

  const highlights = data?.highlights ?? [];
  const enabled = data?.highlightsEnabled ?? false;

  function handleReorder(newOrder: HighlightItem[]) {
    qc.setQueryData(["admin-highlights"], {
      highlights: newOrder,
      highlightsEnabled: enabled,
    });
    reorder.mutate(newOrder);
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-stone-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("highlights")}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {t("hlPageSubtitle")}
        </p>
      </motion.div>

      {/* Master toggle */}
      <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
            <Sparkles className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-900">
              {t("hlShowInFeed")}
            </p>
            <p className="text-xs text-stone-500">
              {enabled
                ? t("hlVisibleToMembers")
                : t("hlHiddenFromAll")}
            </p>
          </div>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => toggleSection.mutate(v)}
          disabled={toggleSection.isPending}
        />
      </div>

      {/* Highlights list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-stone-700">
            {highlights.length} highlight{highlights.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-stone-800"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("hlNew")}
          </button>
        </div>

        {highlights.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-stone-200 py-12 text-center">
            <ImagePlus className="mb-2 h-10 w-10 text-stone-300" />
            <p className="text-sm font-medium text-stone-500">
              {t("hlNoHighlights")}
            </p>
            <p className="mt-1 max-w-xs text-xs text-stone-400">
              {t("hlNoHighlightsDesc")}
            </p>
            <button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
              className="mt-4 flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("hlCreate")}
            </button>
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={highlights}
            onReorder={handleReorder}
            className="space-y-2"
          >
            {highlights.map((h) => (
              <HighlightCard
                key={h.id}
                item={h}
                onEdit={() => {
                  setEditing(h);
                  setDialogOpen(true);
                }}
                onToggle={() =>
                  updateHighlight.mutate({
                    id: h.id,
                    isActive: !h.isActive,
                  })
                }
                onDelete={() => {
                  if (confirm(t("hlDeleteConfirm"))) {
                    deleteHighlight.mutate(h.id);
                  }
                }}
              />
            ))}
          </Reorder.Group>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (!v) {
            setEditing(null);
          }
          setDialogOpen(v);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("hlEdit") : t("hlNew")}
            </DialogTitle>
          </DialogHeader>
          <HighlightForm
            initial={editing ?? undefined}
            saving={createHighlight.isPending || updateHighlight.isPending}
            onCancel={() => {
              setDialogOpen(false);
              setEditing(null);
            }}
            onSave={(formData) => {
              if (editing) {
                updateHighlight.mutate({ id: editing.id, ...formData });
              } else {
                createHighlight.mutate(formData);
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
