"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  Plus,
  CalendarDays,
  Users,
  Pencil,
  XCircle,
  Loader2,
  Search,
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
  Eye,
  Repeat,
} from "lucide-react";
import Link from "next/link";
import { format, isPast } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatTime } from "@/lib/utils";
import { ClassFormDialog } from "@/components/admin/class-form-dialog";
import type { ClassWithDetails } from "@/types";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function AdminClassesPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassWithDetails | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("upcoming");
  const [searchQuery, setSearchQuery] = useState("");
  const [cancelTarget, setCancelTarget] = useState<ClassWithDetails | null>(null);
  const [showCancelAllFuture, setShowCancelAllFuture] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [sort, setSort] = useState<{ key: "startsAt" | "classType" | "coach" | "studio" | "enrolled"; dir: "asc" | "desc" }>({
    key: "startsAt",
    dir: statusFilter === "past" ? "desc" : "asc",
  });

  const { data: classes, isLoading } = useQuery<ClassWithDetails[]>({
    queryKey: ["admin-classes"],
    queryFn: async () => {
      const res = await fetch("/api/classes");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  function openCreateDialog() {
    setEditingClass(null);
    setDialogOpen(true);
  }

  function openEditDialog(cls: ClassWithDetails) {
    setEditingClass(cls);
    setDialogOpen(true);
  }

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
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      setCancelTarget(null);
      toast.success(t("classCancelled"));
    },
    onError: (err: Error) => toast.error(err.message || t("classCancelError")),
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
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      setCancelTarget(null);
      toast.success(t("classSeriesCancelled", { count: data.count }));
    },
    onError: (err: Error) => toast.error(err.message || t("classCancelError")),
  });

  const cancelAllFutureMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/classes/cancel-future", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      setShowCancelAllFuture(false);
      toast.success(t("allFutureCancelled", { count: data.count }));
    },
    onError: (err: Error) => toast.error(err.message || t("classCancelError")),
  });

  const filtered = useMemo(() => {
    const base = (classes ?? [])
      .filter((c) => {
        if (statusFilter === "upcoming") return c.status === "SCHEDULED" && !isPast(new Date(c.endsAt));
        if (statusFilter === "past") return c.status !== "CANCELLED" && isPast(new Date(c.endsAt));
        if (statusFilter === "CANCELLED") return c.status === "CANCELLED";
        return true;
      })
      .filter((c) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          c.classType.name.toLowerCase().includes(q) ||
          c.coach.name?.toLowerCase().includes(q) ||
          c.tag?.toLowerCase().includes(q) ||
          c.room?.studio?.name?.toLowerCase().includes(q) ||
          c.room?.name?.toLowerCase().includes(q)
        );
      });

    const sorted = base.slice().sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      if (sort.key === "startsAt") return (new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()) * dir;
      if (sort.key === "classType") return a.classType.name.localeCompare(b.classType.name) * dir;
      if (sort.key === "coach") return (a.coach.name ?? "").localeCompare(b.coach.name ?? "") * dir;
      if (sort.key === "studio") return (a.room?.studio?.name ?? "").localeCompare(b.room?.studio?.name ?? "") * dir;
      const aEnrolled = a._count?.bookings ?? 0;
      const bEnrolled = b._count?.bookings ?? 0;
      return (aEnrolled - bEnrolled) * dir;
    });

    return sorted;
  }, [classes, searchQuery, sort.dir, sort.key, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  function toggleSort(key: typeof sort.key) {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
  }

  const upcomingCount = classes?.filter((c) => c.status === "SCHEDULED" && !isPast(new Date(c.endsAt))).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("classes")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("classesScheduled", { count: upcomingCount })}
          </p>
        </motion.div>

        <div className="flex items-center gap-2">
          {upcomingCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => setShowCancelAllFuture(true)}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("cancelAllFuture")}
            </Button>
          )}
          <Button onClick={openCreateDialog} className="gap-2 bg-admin hover:bg-admin/90">
            <Plus className="h-4 w-4" />
            {t("createClass")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-10"
            placeholder={t("searchClasses")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">{t("upcoming")}</SelectItem>
            <SelectItem value="past">{t("past")}</SelectItem>
            <SelectItem value="CANCELLED">{t("cancelled")}</SelectItem>
            <SelectItem value="all">{t("all")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Classes list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : !filtered?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarDays className="h-10 w-10 text-muted/30" />
            <p className="font-medium text-muted">{t("notFoundClasses")}</p>
            {statusFilter === "upcoming" && (
              <Button onClick={openCreateDialog} variant="outline" size="sm" className="mt-2 gap-2">
                <Plus className="h-3.5 w-3.5" />
                {t("createFirstClass")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: Table */}
          <div className="hidden sm:block">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-surface/40">
                    <TableRow>
                      <TableHead className="text-xs font-semibold uppercase">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto px-0 text-xs font-semibold uppercase text-muted hover:bg-transparent"
                          onClick={() => toggleSort("startsAt")}
                        >
                          {t("date")}
                          {sort.key === "startsAt" && (sort.dir === "asc" ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />)}
                        </Button>
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto px-0 text-xs font-semibold uppercase text-muted hover:bg-transparent"
                          onClick={() => toggleSort("classType")}
                        >
                          {t("discipline")}
                          {sort.key === "classType" && (sort.dir === "asc" ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />)}
                        </Button>
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto px-0 text-xs font-semibold uppercase text-muted hover:bg-transparent"
                          onClick={() => toggleSort("coach")}
                        >
                          {t("coachLabel")}
                          {sort.key === "coach" && (sort.dir === "asc" ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />)}
                        </Button>
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto px-0 text-xs font-semibold uppercase text-muted hover:bg-transparent"
                          onClick={() => toggleSort("studio")}
                        >
                          {t("studio")}
                          {sort.key === "studio" && (sort.dir === "asc" ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />)}
                        </Button>
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto px-0 text-xs font-semibold uppercase text-muted hover:bg-transparent"
                          onClick={() => toggleSort("enrolled")}
                        >
                          {t("spots")}
                          {sort.key === "enrolled" && (sort.dir === "asc" ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />)}
                        </Button>
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase">{t("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((cls) => {
                      const enrolled = cls._count?.bookings ?? 0;
                      const maxCap = cls.room?.maxCapacity ?? 0;
                      const past = isPast(new Date(cls.endsAt));
                      const isCancelled = cls.status === "CANCELLED";
                      return (
                        <TableRow key={cls.id} className={cn((past || isCancelled) && "opacity-60")}>
                          <TableCell className="py-3">
                            <div className="text-sm font-medium text-foreground">
                              {format(new Date(cls.startsAt), "EEE d MMM", { locale: es })}
                            </div>
                            <div className="text-xs text-muted font-mono">
                              {formatTime(cls.startsAt)}–{formatTime(cls.endsAt)}
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cls.classType.color || "#1A2C4E" }} />
                              <span className="text-sm font-semibold">{cls.classType.name}</span>
                              {cls.recurringId && (
                                <span title="Serie recurrente" className="text-muted"><Repeat className="h-3 w-3" /></span>
                              )}
                              {cls.tag && <Badge variant="outline" className="text-[10px]">{cls.tag}</Badge>}
                              {isCancelled && <Badge variant="danger">{t("cancelled")}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="py-3 text-sm">{cls.coach.name}</TableCell>
                          <TableCell className="py-3">
                            {cls.room?.studio ? (
                              <div className="text-sm">
                                <div className="font-medium">{cls.room.studio.name}</div>
                                <div className="text-xs text-muted">{cls.room.name}</div>
                              </div>
                            ) : (
                              <span className="text-sm text-muted">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <span className={cn("font-mono text-sm", enrolled >= maxCap ? "text-red-600" : "text-foreground")}>
                              {enrolled}/{maxCap}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              <Link href={`/admin/class/${cls.id}`}>
                                <Button variant="ghost" size="sm" className="gap-1">
                                  <Eye className="h-3.5 w-3.5" />
                                  {tc("view")}
                                </Button>
                              </Link>
                              {!isCancelled && (
                                <Button variant="ghost" size="sm" className="gap-1" onClick={() => openEditDialog(cls)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                  {tc("edit")}
                                </Button>
                              )}
                              {cls.status === "SCHEDULED" && !past && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-destructive hover:text-destructive"
                                  onClick={() => setCancelTarget(cls)}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  {tc("cancel")}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between gap-3 border-t border-border/50 px-4 py-3">
                  <p className="text-sm text-muted">
                    {tc("page", { current: pageSafe, total: totalPages })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v, 10) || 12); setPage(1); }}>
                      <SelectTrigger className="h-9 w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[8, 12, 20, 40].map((n) => (
                          <SelectItem key={n} value={String(n)}>{tc("perPage", { num: n })}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1}>
                      {tc("previous")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages}>
                      {tc("next")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Mobile: Cards */}
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2 sm:hidden">
          {filtered.map((cls) => {
            const enrolled = cls._count?.bookings ?? 0;
            const maxCap = cls.room?.maxCapacity ?? 0;
            const past = isPast(new Date(cls.endsAt));
            const isCancelled = cls.status === "CANCELLED";

            return (
              <motion.div key={cls.id} variants={fadeUp}>
                <Card className={cn(
                  "transition-shadow",
                  !past && !isCancelled && "hover:shadow-warm",
                  (past || isCancelled) && "opacity-60",
                )}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div
                      className="hidden h-12 w-1 shrink-0 rounded-full sm:block"
                      style={{ backgroundColor: cls.classType.color || "#1A2C4E" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-display text-base font-bold">
                          {cls.classType.name}
                        </p>
                        {cls.tag && (
                          <Badge variant="outline" className="text-[10px]">
                            {cls.tag}
                          </Badge>
                        )}
                        {isCancelled && <Badge variant="danger">{t("cancelled")}</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                        <span className="flex items-center gap-1 capitalize">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {format(new Date(cls.startsAt), "EEE d MMM", { locale: es })}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-foreground">
                          <Clock className="h-3.5 w-3.5 text-muted" />
                          {formatTime(cls.startsAt)} – {formatTime(cls.endsAt)}
                        </span>
                        <span>{cls.coach.name}</span>
                        {cls.room?.studio && (
                          <span className="flex items-center gap-1 text-muted/70">
                            <MapPin className="h-3 w-3" />
                            {cls.room.studio.name} · {cls.room.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm",
                        enrolled >= maxCap ? "bg-red-50 text-red-600" : "bg-surface text-muted",
                      )}>
                        <Users className="h-3.5 w-3.5" />
                        <span className="font-mono text-[13px]">
                          {enrolled}/{maxCap}
                        </span>
                      </div>
                      <Link href={`/admin/class/${cls.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      {!isCancelled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => openEditDialog(cls)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{tc("edit")}</span>
                        </Button>
                      )}
                      {cls.status === "SCHEDULED" && !past && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-destructive hover:text-destructive"
                          onClick={() => setCancelTarget(cls)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{tc("cancel")}</span>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
          </motion.div>
        </>
      )}

      {/* Create / Edit class dialog */}
      <ClassFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingClass(null); }}
        editingClass={editingClass}
      />

      {/* Cancel confirmation dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelClass")}</DialogTitle>
            <DialogDescription>
              {t("cancelClassConfirm", {
                className: cancelTarget?.classType.name ?? "",
                date: cancelTarget ? format(new Date(cancelTarget.startsAt), "EEE d MMM", { locale: es }) : "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
              disabled={cancelMutation.isPending || cancelSeriesMutation.isPending}
            >
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("confirmCancel")}
            </Button>
            {cancelTarget?.recurringId && (
              <Button
                variant="outline"
                className="w-full border-destructive text-destructive hover:bg-destructive/5"
                onClick={() => cancelTarget.recurringId && cancelSeriesMutation.mutate(cancelTarget.recurringId)}
                disabled={cancelMutation.isPending || cancelSeriesMutation.isPending}
              >
                {cancelSeriesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("cancelSeries")}
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={() => setCancelTarget(null)}>
              {tc("back")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel all future classes dialog */}
      <Dialog open={showCancelAllFuture} onOpenChange={setShowCancelAllFuture}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelAllFuture")}</DialogTitle>
            <DialogDescription>
              {t("cancelAllFutureConfirm", { count: upcomingCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCancelAllFuture(false)}>
              {tc("back")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelAllFutureMutation.mutate()}
              disabled={cancelAllFutureMutation.isPending}
            >
              {cancelAllFutureMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("cancelAllFuture")} ({upcomingCount})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
