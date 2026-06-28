"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn, formatDate, formatTime } from "@/lib/utils";

/* ── Cancel booking ─────────────────────────────────────────────────── */

export function CancelBookingDialog({
  open,
  onOpenChange,
  bookingId,
  memberName,
  onSuccess,
  autoPromote = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
  memberName: string;
  onSuccess?: () => void;
  /**
   * Whether cancelling should auto-promote the waitlist. The check-in surface
   * passes false so the freed seat is filled manually (the present person),
   * not automatically by waitlist position.
   */
  autoPromote?: boolean;
}) {
  const t = useTranslations("admin");
  const [refundCredit, setRefundCredit] = useState(true);

  const mutation = useMutation({
    mutationFn: async ({ id, refund }: { id: string; refund: boolean }) => {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED", refundCredit: refund, autoPromote }),
      });
      if (!res.ok) throw new Error("cancel failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success(t("bookingCancelled"));
      onOpenChange(false);
      onSuccess?.();
    },
    onError: () => toast.error(t("bookingCancelError")),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("cancelBooking")}</DialogTitle>
          <DialogDescription>
            {t("cancelBookingDesc", { name: memberName })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-surface/40 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("refundCredit")}
            </p>
            <p className="mt-0.5 text-xs text-muted">{t("refundCreditHint")}</p>
          </div>
          <Switch checked={refundCredit} onCheckedChange={setRefundCredit} />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t("keepBooking")}
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              bookingId &&
              mutation.mutate({ id: bookingId, refund: refundCredit })
            }
            disabled={mutation.isPending || !bookingId}
            className="gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t("cancelBookingConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Move booking ───────────────────────────────────────────────────── */

interface MoveClassOption {
  id: string;
  startsAt: string;
  classType: { id: string; name: string; color: string | null };
  coach: { name: string | null } | null;
  room: { maxCapacity: number; studio: { name: string | null } | null } | null;
  _count: { bookings: number };
}

export function MoveBookingDialog({
  open,
  onOpenChange,
  bookingId,
  memberName,
  currentClassId,
  currentClassTypeId,
  onSuccess,
  endpoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
  memberName: string;
  currentClassId: string;
  currentClassTypeId?: string | null;
  onSuccess?: () => void;
  /**
   * POST endpoint factory for the move. Defaults to the member-booking move.
   * Wellhub passes the platform-booking move endpoint. Receives the booking id.
   */
  endpoint?: (id: string) => string;
}) {
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ classes: MoveClassOption[] }>({
    queryKey: ["move-classes"],
    queryFn: async () => {
      const res = await fetch("/api/admin/classes?status=upcoming&take=100");
      if (!res.ok) return { classes: [] };
      return res.json();
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async ({
      id,
      targetClassId,
    }: {
      id: string;
      targetClassId: string;
    }) => {
      const url = endpoint ? endpoint(id) : `/api/admin/bookings/${id}/move`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetClassId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "move failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t("bookingMoved"));
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err: Error) => toast.error(err.message || t("bookingMoveError")),
  });

  const q = search.trim().toLowerCase();
  const options = (data?.classes ?? [])
    .filter((c) => c.id !== currentClassId)
    .filter((c) => {
      if (!q) return true;
      const hay = `${c.classType.name} ${c.coach?.name ?? ""} ${
        c.room?.studio?.name ?? ""
      }`.toLowerCase();
      return hay.includes(q);
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="flex max-h-[85dvh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle>{t("moveBooking")}</DialogTitle>
          <DialogDescription>
            {t("moveBookingDesc", { name: memberName })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("moveSearchPlaceholder")}
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-admin"
          />
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : options.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              {t("moveNoClasses")}
            </p>
          ) : (
            <div className="space-y-1.5 py-1">
              {options.map((c) => {
                const cap = c.room?.maxCapacity ?? 0;
                const spotsLeft = cap - c._count.bookings;
                const full = spotsLeft <= 0;
                const sameType = c.classType.id === currentClassTypeId;
                const isMoving =
                  mutation.isPending &&
                  mutation.variables?.targetClassId === c.id;
                return (
                  <button
                    key={c.id}
                    disabled={full || mutation.isPending}
                    onClick={() =>
                      bookingId &&
                      mutation.mutate({ id: bookingId, targetClassId: c.id })
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition-colors",
                      full
                        ? "cursor-not-allowed opacity-50"
                        : "hover:border-admin/40 hover:bg-admin/5 active:bg-admin/10",
                    )}
                  >
                    <span
                      className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: c.classType.color ?? "var(--color-admin)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {c.classType.name}
                        </p>
                        {sameType && (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {t("moveSameType")}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted">
                        {formatDate(c.startsAt)} · {formatTime(c.startsAt)}
                        {c.coach?.name ? ` · ${c.coach.name}` : ""}
                        {c.room?.studio?.name ? ` · ${c.room.studio.name}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {isMoving ? (
                        <Loader2 className="h-4 w-4 animate-spin text-admin" />
                      ) : (
                        <span
                          className={cn(
                            "text-xs font-medium",
                            full ? "text-red-500" : "text-muted",
                          )}
                        >
                          {full
                            ? t("moveFull")
                            : t("moveSpotsLeft", { count: spotsLeft })}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
