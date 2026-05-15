"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Tag,
  GripVertical,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  _count: { videos: number };
}

export function OnDemandCategoriesTab() {
  const t = useTranslations("admin.onDemand");
  const tc = useTranslations("common");
  const qc = useQueryClient();

  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-on-demand-categories"],
    queryFn: async () => {
      const res = await fetch("/api/admin/on-demand/categories");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as { categories: CategoryRow[] };
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/on-demand/categories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-on-demand-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-on-demand-videos"] });
    },
  });

  const categories = data?.categories ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {t("categoriesTitle")}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{t("categoriesSubtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("newCategory")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Tag className="h-10 w-10 text-muted/40" />
            <p className="text-sm font-medium text-foreground">
              {t("noCategoriesTitle")}
            </p>
            <p className="max-w-sm text-xs text-muted">
              {t("noCategoriesDesc")}
            </p>
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("newCategory")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/50">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <GripVertical className="h-4 w-4 text-muted/40" />
                  <span
                    className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.name}
                    </p>
                    <p className="text-xs text-muted">
                      {c._count.videos === 1
                        ? t("oneVideo")
                        : t("nVideos", { count: c._count.videos })}
                      {!c.isActive ? ` · ${t("hidden")}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => setEditing(c)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {tc("edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm(t("confirmDeleteCategory"))) {
                        remove.mutate(c.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <CategoryDialog
        open={creating || !!editing}
        category={editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["admin-on-demand-categories"] });
          qc.invalidateQueries({ queryKey: ["admin-on-demand-videos"] });
          qc.invalidateQueries({ queryKey: ["on-demand-catalog"] });
        }}
      />
    </div>
  );
}

const COLOR_SWATCHES = [
  "#C9A96E",
  "#E07A5F",
  "#81B29A",
  "#3D5A80",
  "#9B5DE5",
  "#F15BB5",
  "#00BBF9",
  "#00F5D4",
  "#FF6B6B",
  "#FFD166",
];

function CategoryDialog({
  open,
  category,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  category: CategoryRow | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("admin.onDemand");
  const tc = useTranslations("common");

  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? COLOR_SWATCHES[0]);

  // Reset form when dialog opens with new state
  const [lastId, setLastId] = useState<string | null>(null);
  if (open && lastId !== (category?.id ?? "__new__")) {
    setLastId(category?.id ?? "__new__");
    setName(category?.name ?? "");
    setColor(category?.color ?? COLOR_SWATCHES[0]);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (category) {
        const res = await fetch(
          `/api/admin/on-demand/categories/${category.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), color }),
          },
        );
        if (!res.ok) throw new Error("Failed");
        return res.json();
      }
      const res = await fetch("/api/admin/on-demand/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? t("editCategory") : t("newCategory")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">{t("categoryNameLabel")}</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("categoryNamePlaceholder")}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{t("categoryColorLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`h-8 w-8 rounded-full border-2 transition-transform ${
                    color === c
                      ? "scale-110 border-foreground"
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
              className="gap-2"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {tc("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
