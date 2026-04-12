"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { format, isPast } from "date-fns";
import { es, enUS } from "date-fns/locale";
import {
  Clock,
  Users,
  MapPin,
  Pencil,
  XCircle,
  ExternalLink,
  Loader2,
  Tag,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, formatTime } from "@/lib/utils";
import type { ClassWithDetails } from "@/types";

interface ClassDetailDialogProps {
  cls: ClassWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (cls: ClassWithDetails) => void;
}

export function ClassDetailDialog({
  cls,
  open,
  onOpenChange,
  onEdit,
}: ClassDetailDialogProps) {
  const t = useTranslations("admin.classDetail");
  const queryClient = useQueryClient();
  const [confirmMode, setConfirmMode] = useState<"none" | "single" | "series">("none");

  const cancelMutation = useMutation({
    mutationFn: async (classId: string) => {
      const res = await fetch(`/api/classes/${classId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      onOpenChange(false);
      setConfirmMode("none");
      toast.success(t("classCancelled"));
    },
    onError: (err: Error) => toast.error(err.message || t("cancelError")),
  });

  const cancelSeriesMutation = useMutation({
    mutationFn: async (recurringId: string) => {
      const res = await fetch(`/api/classes/series/${recurringId}?futureOnly=true`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      onOpenChange(false);
      setConfirmMode("none");
      toast.success(t("seriesCancelled", { count: data.count }));
    },
    onError: (err: Error) => toast.error(err.message || t("cancelError")),
  });

  if (!cls) return null;

  const start = new Date(cls.startsAt);
  const past = isPast(start);
  const isCancelled = cls.status === "CANCELLED";
  const booked = cls._count?.bookings ?? 0;
  const maxCap = cls.room?.maxCapacity ?? 0;
  const occupancy = maxCap > 0 ? Math.round((booked / maxCap) * 100) : 0;
  const isPending = cancelMutation.isPending || cancelSeriesMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setConfirmMode("none");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: cls.classType.color }}
            />
            <DialogTitle className="text-lg">{cls.classType.name}</DialogTitle>
            {cls.recurringId && (
              <span title={t("recurringSeries")} className="text-muted">
                <Repeat className="h-3 w-3" />
              </span>
            )}
            {isCancelled && (
              <Badge variant="danger" className="text-[10px]">{t("cancelled")}</Badge>
            )}
            {past && !isCancelled && (
              <Badge variant="outline" className="text-[10px] text-muted">{t("past")}</Badge>
            )}
          </div>
          <DialogDescription>
            {format(start, "EEEE d 'de' MMMM, yyyy", { locale: es })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2.5 text-sm">
            <Clock className="h-4 w-4 text-muted" />
            <span>{formatTime(cls.startsAt)} — {cls.classType.duration} min</span>
          </div>

          <div className="flex items-center gap-2.5 text-sm">
            <Users className="h-4 w-4 text-muted" />
            <span>
              {booked}/{maxCap} {t("bookings")}
              <span className={cn(
                "ml-1.5 text-xs font-medium",
                occupancy >= 80 ? "text-green-600" : occupancy >= 40 ? "text-amber-600" : "text-muted",
              )}>
                ({occupancy}%)
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-sm">
            <MapPin className="h-4 w-4 text-muted" />
            <span>{cls.room?.studio?.name} — {cls.room?.name}</span>
          </div>

          <div className="flex items-center gap-2.5 text-sm">
            <div className="flex h-4 w-4 items-center justify-center">
              {(cls.coach.photoUrl || cls.coach.user?.image) ? (
                <img
                  src={cls.coach.photoUrl || cls.coach.user?.image!}
                  alt=""
                  className="h-4 w-4 rounded-full object-cover"
                />
              ) : (
                <div className="h-4 w-4 rounded-full bg-accent/20 text-[8px] font-bold text-accent flex items-center justify-center">
                  {cls.coach.name?.charAt(0)}
                </div>
              )}
            </div>
            <span>{cls.coach.name}</span>
          </div>

          {cls.tag && (
            <div className="flex items-center gap-2.5 text-sm">
              <Tag className="h-4 w-4 text-muted" />
              <Badge variant="outline" className="text-xs">{cls.tag}</Badge>
            </div>
          )}
        </div>

        {/* Confirmation step */}
        {confirmMode !== "none" && (
          <div className="rounded-lg border border-destructive/20 bg-red-50 p-4 space-y-3">
            <p className="text-sm font-medium text-red-700">
              {confirmMode === "single" ? t("confirmCancelSingle") : t("confirmCancelSeries")}
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                disabled={isPending}
                onClick={() => {
                  if (confirmMode === "single") {
                    cancelMutation.mutate(cls.id);
                  } else if (cls.recurringId) {
                    cancelSeriesMutation.mutate(cls.recurringId);
                  }
                }}
              >
                {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t("confirm")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmMode("none")}
                disabled={isPending}
              >
                {t("goBack")}
              </Button>
            </div>
          </div>
        )}

        {confirmMode === "none" && (
          <DialogFooter className="flex-col gap-2 pt-4 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              asChild
            >
              <a href={`/class/${cls.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {t("viewClass")}
              </a>
            </Button>

            {!isCancelled && !past && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    onOpenChange(false);
                    setTimeout(() => onEdit(cls), 150);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("edit")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setConfirmMode("single")}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {t("cancelClass")}
                </Button>
                {cls.recurringId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5"
                    onClick={() => setConfirmMode("series")}
                  >
                    <Repeat className="h-3.5 w-3.5" />
                    {t("cancelSeries")}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
