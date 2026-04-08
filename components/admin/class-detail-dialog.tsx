"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isPast } from "date-fns";
import { es } from "date-fns/locale";
import {
  Clock,
  Users,
  MapPin,
  Pencil,
  XCircle,
  ExternalLink,
  Loader2,
  Tag,
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
  const queryClient = useQueryClient();

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
      toast.success("Clase cancelada");
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo cancelar"),
  });

  if (!cls) return null;

  const start = new Date(cls.startsAt);
  const past = isPast(start);
  const isCancelled = cls.status === "CANCELLED";
  const booked = cls._count?.bookings ?? 0;
  const maxCap = cls.room?.maxCapacity ?? 0;
  const occupancy = maxCap > 0 ? Math.round((booked / maxCap) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: cls.classType.color }}
            />
            <DialogTitle className="text-lg">{cls.classType.name}</DialogTitle>
            {isCancelled && (
              <Badge variant="danger" className="text-[10px]">Cancelada</Badge>
            )}
            {past && !isCancelled && (
              <Badge variant="outline" className="text-[10px] text-muted">Pasada</Badge>
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
              {booked}/{maxCap} reservas
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

        <DialogFooter className="flex-col gap-2 pt-4 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            asChild
          >
            <a href={`/class/${cls.id}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Ver clase
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
                Editar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => cancelMutation.mutate(cls.id)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                Cancelar clase
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
