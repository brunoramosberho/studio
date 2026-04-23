"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  Package,
  CalendarDays,
  CalendarSync,
  Flame,
  TrendingUp,
  Clock,
  Eye,
  Smartphone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Mail,
  Phone,
  Cake,
  Star,
  Pause,
  Play,
  DollarSign,
  CreditCard,
  Receipt,
  Gift,
  Trophy,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatDate, formatCurrency, timeAgo, getDateLocale } from "@/lib/utils";
import { format } from "date-fns";
import { usePosStore } from "@/store/pos-store";
import { ShoppingBag } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

interface ClientDetail {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  phone: string | null;
  birthday: string | null;
  instagramUser: string | null;
  stravaUser: string | null;
  memberSince: string;
  pwaInstalledAt: string | null;
  lastSeenAt: string | null;
  role: string;
  stats: {
    totalClasses: number;
    classesThisMonth: number;
    totalBookings: number;
    currentStreak: number;
    longestStreak: number;
    daysSinceLastVisit: number | null;
  };
  level: { name: string; icon: string; color: string; minClasses: number } | null;
  nextLevel: { name: string; icon: string; color: string; minClasses: number } | null;
  progressPercent: number;
  classesToNext: number;
  achievements: {
    id: string;
    key: string;
    name: string;
    icon: string;
    description: string | null;
    earned: boolean;
    earnedAt: string | null;
  }[];
  packages: {
    id: string;
    name: string;
    type: string;
    creditsTotal: number | null;
    creditsUsed: number;
    creditsRemaining: number;
    expiresAt: string;
    isActive: boolean;
    status: "ACTIVE" | "PENDING_PAYMENT" | "PAYMENT_FAILED" | "REVOKED" | "DISPUTED";
    revokedReason: string | null;
  }[];
  debts: {
    id: string;
    amount: number;
    currency: string;
    reason: string;
    status: "OPEN" | "PAID" | "FORGIVEN" | "DISPUTED";
    notes: string | null;
    createdAt: string;
    resolvedAt: string | null;
    resolvedByName: string | null;
    userPackageName: string | null;
    stripePaymentId: string | null;
  }[];
  upcomingBookings: {
    id: string;
    classId: string;
    className: string;
    classColor: string | null;
    coachName: string | null;
    roomName: string;
    startsAt: string;
    endsAt: string;
    status: string;
    spotNumber: number | null;
  }[];
  pastBookings: {
    id: string;
    classId: string;
    className: string;
    classColor: string | null;
    coachName: string | null;
    startsAt: string;
    status: string;
  }[];
  subscriptions: {
    id: string;
    stripeSubscriptionId: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    pausedAt: string | null;
    resumesAt: string | null;
    canceledAt: string | null;
    package: {
      id: string;
      name: string;
      price: number;
      currency: string;
      recurringInterval: string | null;
    };
  }[];
  paymentHistory: {
    id: string;
    amount: number;
    method: string;
    type: string;
    typeLabel: string;
    concept: string | null;
    itemName: string | null;
    itemHref: string | null;
    status: string;
    processedBy: string;
    createdAt: string;
  }[];
  revenueSummary: {
    totalHistoric: number;
    totalThisYear: number;
    totalThisMonth: number;
    transactionsCount: number;
    transactionsThisYear: number;
    byType: { type: string; amount: number }[];
  };
}

function useStatusMap(t: ReturnType<typeof useTranslations<"admin.clientProfile">>) {
  return {
    ATTENDED: { label: t("attended"), color: "text-green-600 bg-green-50", icon: CheckCircle2 },
    CONFIRMED: { label: t("confirmed"), color: "text-blue-600 bg-blue-50", icon: CalendarDays },
    NO_SHOW: { label: t("noShow"), color: "text-red-600 bg-red-50", icon: XCircle },
    CANCELLED: { label: t("cancelled"), color: "text-gray-500 bg-gray-50", icon: AlertCircle },
  } as Record<string, { label: string; color: string; icon: typeof CheckCircle2 }>;
}

function useSubStatusBadge(t: ReturnType<typeof useTranslations<"admin.clientProfile">>) {
  return {
    active: { label: t("subActive"), variant: "success" },
    past_due: { label: t("subPastDue"), variant: "warning" },
    paused: { label: t("subPaused"), variant: "secondary" },
    canceled: { label: t("subCanceled"), variant: "danger" },
    trialing: { label: t("subTrialing"), variant: "secondary" },
    incomplete: { label: t("subIncomplete"), variant: "warning" },
  } as Record<string, { label: string; variant: "success" | "warning" | "secondary" | "danger" }>;
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: typeof Trophy;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold">{value}</p>
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", accent || "bg-admin/10")}>
            <Icon className={cn("h-5 w-5", accent ? "text-white" : "text-admin")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewSaleButton({ client, label }: { client: ClientDetail; label: string }) {
  const { openPOS } = usePosStore();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        openPOS({
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          image: client.image,
        })
      }
      className="gap-1.5"
    >
      <ShoppingBag className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

interface GiftPkg {
  id: string;
  name: string;
  credits: number | null;
  validDays: number;
  price: number;
  currency: string;
  type: string;
}

function GiftPackageButton({ clientId, clientName, t, tc }: { clientId: string; clientName: string; t: ReturnType<typeof useTranslations<"admin.clientProfile">>; tc: ReturnType<typeof useTranslations<"common">> }) {
  const [open, setOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<string>("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const { data: packages } = useQuery<GiftPkg[]>({
    queryKey: ["gift-packages-list"],
    queryFn: () =>
      fetch("/api/packages?all=true")
        .then((r) => r.json())
        .then((pkgs: (GiftPkg & { isActive: boolean })[]) =>
          pkgs.filter((p) => p.isActive),
        ),
    enabled: open,
  });

  const giftMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/gift-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: clientId,
          packageId: selectedPkg,
          reason,
          notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(t("giftSuccess", { packageName: data.packageName, clientName }));
      queryClient.invalidateQueries({ queryKey: ["admin-client", clientId] });
      setOpen(false);
      setSelectedPkg("");
      setReason("");
      setNotes("");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Gift className="h-3.5 w-3.5" />
        {t("giftPackage")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              {t("giftPackageTo", { name: clientName })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("package")}</label>
              <select
                value={selectedPkg}
                onChange={(e) => setSelectedPkg(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">{t("selectPackage")}</option>
                {packages?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.credits === null ? t("unlimited") : `${p.credits} ${t("classes")}`} ({p.validDays} {t("days")})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("giftReason")}
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">{t("selectReason")}</option>
                <option value="cortesia">{t("reasonCourtesy")}</option>
                <option value="compensacion">{t("reasonCompensation")}</option>
                <option value="promocion">{t("reasonPromotion")}</option>
                <option value="fidelidad">{t("reasonLoyalty")}</option>
                <option value="cumpleanos">{t("reasonBirthday")}</option>
                <option value="referido">{t("reasonReferral")}</option>
                <option value="otro">{t("reasonOther")}</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("internalNotes")}
              </label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("internalNotesPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button
                onClick={() => giftMutation.mutate()}
                disabled={!selectedPkg || !reason || giftMutation.isPending}
              >
                {giftMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <Gift className="mr-2 h-4 w-4" />
                {t("gift")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const t = useTranslations("admin.clientProfile");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const STATUS_MAP = useStatusMap(t);
  const SUB_STATUS_BADGE = useSubStatusBadge(t);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "instant" });
  }, [id]);

  const { data: client, isLoading, error } = useQuery<ClientDetail>({
    queryKey: ["admin-client", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/clients/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  const attendanceMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: "ATTENDED" | "NO_SHOW" }) => {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      toast.success(variables.status === "ATTENDED" ? t("markedAttended") : t("markedNoShow"));
    },
    onError: () => toast.error(t("attendanceError")),
  });

  const subActionMutation = useMutation({
    mutationFn: async ({
      subscriptionId,
      action,
      resumesAt,
    }: {
      subscriptionId: string;
      action: "pause" | "resume" | "cancel";
      resumesAt?: string;
    }) => {
      const res = await fetch("/api/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, action, resumesAt }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      toast.success(t("subscriptionUpdated"));
      setPauseSubDialog(null);
    },
    onError: () => toast.error(t("subscriptionError")),
  });

  const grantPrizeMutation = useMutation({
    mutationFn: async ({
      achievementKey,
      rewardText,
    }: {
      achievementKey: string;
      rewardText: string;
    }) => {
      const res = await fetch("/api/admin/gamification/prize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, achievementKey, rewardText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      toast.success(t("prizeGranted"));
      setPrizeDialog(null);
      setPrizeText("");
    },
    onError: (err: Error) => toast.error(err.message || t("prizeError")),
  });

  const resolveDebtMutation = useMutation({
    mutationFn: async ({
      debtId,
      action,
      notes,
    }: {
      debtId: string;
      action: "paid" | "forgiven";
      notes?: string;
    }) => {
      const res = await fetch(`/api/admin/debts/${debtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      toast.success(
        variables.action === "paid" ? "Deuda marcada como pagada" : "Deuda perdonada",
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [prizeDialog, setPrizeDialog] = useState<ClientDetail["achievements"][number] | null>(null);
  const [prizeText, setPrizeText] = useState("");

  const [pauseSubDialog, setPauseSubDialog] = useState<ClientDetail["subscriptions"][number] | null>(null);
  const [pauseDays, setPauseDays] = useState("14");
  const [showExpiredPkgs, setShowExpiredPkgs] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3 py-4">
          <div className="h-5 w-5 animate-pulse rounded bg-surface" />
          <div className="h-5 w-32 animate-pulse rounded bg-surface" />
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <div className="h-64 animate-pulse rounded-2xl bg-surface" />
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />
              ))}
            </div>
            <div className="h-48 animate-pulse rounded-2xl bg-surface" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="mx-auto max-w-5xl py-12 text-center">
        <p className="text-muted">{t("clientNotFound")}</p>
        <Link href="/admin/clients">
          <Button variant="ghost" className="mt-4">{t("backToClientsList")}</Button>
        </Link>
      </div>
    );
  }

  const displayName = client.name || client.email;
  const initials = (client.name || client.email)
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const earnedAchievements = client.achievements.filter((a) => a.earned);
  const lockedAchievements = client.achievements.filter((a) => !a.earned);
  const activePackage = client.packages.find((p) => p.isActive);

  return (
    <div ref={topRef} className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Back + breadcrumb */}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/admin/clients"
            className="flex items-center gap-1.5 text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToClients")}
          </Link>
          <ChevronRight className="h-3 w-3 text-muted/50" />
          <span className="font-medium text-foreground">{displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <GiftPackageButton clientId={client.id} clientName={displayName} t={t} tc={tc} />
          <NewSaleButton client={client} label={t("newSale")} />
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Left sidebar ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Profile card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-20 w-20 ring-4 ring-admin/10">
                  {client.image && <AvatarImage src={client.image} />}
                  <AvatarFallback className="bg-admin/10 text-xl font-bold text-admin">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <h2 className="mt-3 font-display text-lg font-bold">{displayName}</h2>
                {client.name && (
                  <p className="text-sm text-muted">{client.email}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  <Badge variant="admin" className="text-[10px]">{client.role}</Badge>
                  {client.pwaInstalledAt && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Smartphone className="h-3 w-3" /> App
                    </Badge>
                  )}
                </div>
              </div>

              <Separator className="my-4" />

              {/* Contact info */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate text-foreground">{client.email}</span>
                </div>
                {client.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 shrink-0 text-muted" />
                    <span className="text-foreground">{client.phone}</span>
                  </div>
                )}
                {client.birthday && (
                  <div className="flex items-center gap-3 text-sm">
                    <Cake className="h-4 w-4 shrink-0 text-muted" />
                    <span className="text-foreground">
                      {formatDate(client.birthday, locale)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 shrink-0 text-muted" />
                  <span className="text-muted">
                    {t("memberSince", { date: format(new Date(client.memberSince), "MMM yyyy", { locale: dateLocale }) })}
                  </span>
                </div>
                {client.lastSeenAt && (
                  <div className="flex items-center gap-3 text-sm">
                    <Eye className="h-4 w-4 shrink-0 text-muted" />
                    <span className="text-muted">
                      {t("activeSince", { timeAgo: timeAgo(client.lastSeenAt, locale) })}
                    </span>
                  </div>
                )}
                {client.instagramUser && (
                  <a
                    href={`https://instagram.com/${client.instagramUser}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 text-sm text-muted transition-colors hover:text-foreground"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    @{client.instagramUser}
                  </a>
                )}
              </div>

              {client.pwaInstalledAt && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Smartphone className="h-3.5 w-3.5" />
                    {t("appInstalled")} {timeAgo(client.pwaInstalledAt, locale)}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Level progress */}
          {client.level && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{client.level.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: client.level.color }}>
                      {client.level.name}
                    </p>
                    {client.nextLevel ? (
                      <p className="text-[11px] text-muted">
                        {t("classesToNext", { count: client.classesToNext, level: client.nextLevel.name })}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted">{t("maxLevel")}</p>
                    )}
                  </div>
                </div>
                {client.nextLevel && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span>{client.level.name}</span>
                      <span>{client.nextLevel.name}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${client.progressPercent}%`,
                          backgroundColor: client.level.color,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-center text-[10px] font-medium text-muted">
                      {client.progressPercent}%
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Achievements — collapsible, click earned ones to grant a manual prize */}
          {client.achievements.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <button
                  type="button"
                  onClick={() => setShowAchievements(!showAchievements)}
                  className="flex w-full items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-semibold">{t("achievements")}</span>
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                      {earnedAchievements.length}/{client.achievements.length}
                    </span>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", showAchievements && "rotate-180")} />
                </button>
                {showAchievements && (
                  <div className="mt-3">
                    <div className="grid grid-cols-4 gap-1.5">
                      {earnedAchievements.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setPrizeDialog(a)}
                          className="group flex flex-col items-center gap-0.5 rounded-lg bg-surface px-1 py-2 text-center transition-colors hover:bg-amber-50"
                          title={`${a.name} — ${t("clickToGrant")}`}
                        >
                          <span className="text-lg">{a.icon}</span>
                          <span className="text-[8px] font-semibold leading-tight text-foreground">
                            {a.name}
                          </span>
                          <Gift className="h-3 w-3 text-amber-500 opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      ))}
                      {lockedAchievements.map((a) => (
                        <div
                          key={a.id}
                          className="flex flex-col items-center gap-0.5 rounded-lg bg-surface/40 px-1 py-2 text-center opacity-30 grayscale"
                          title={a.description || a.name}
                        >
                          <span className="text-lg">{a.icon}</span>
                          <span className="text-[8px] font-semibold leading-tight text-foreground">
                            {a.name}
                          </span>
                        </div>
                      ))}
                    </div>
                    {earnedAchievements.length > 0 && (
                      <p className="mt-2 text-center text-[10px] text-muted">
                        {t("tapToGrant")}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* ── Main content ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-5 lg:col-span-2"
        >
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t("totalClasses")} value={client.stats.totalClasses} icon={CalendarDays} />
            <StatCard label={t("thisMonth")} value={client.stats.classesThisMonth} icon={TrendingUp} />
            <StatCard label={t("currentStreak")} value={client.stats.currentStreak} icon={Flame} />
            <StatCard
              label={t("lastVisit")}
              value={
                client.stats.daysSinceLastVisit !== null
                  ? client.stats.daysSinceLastVisit === 0
                    ? t("today")
                    : `${client.stats.daysSinceLastVisit}d`
                  : "—"
              }
              icon={Clock}
            />
          </div>

          {/* Packages */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-admin" />
                  <span className="text-sm font-semibold">{t("activePackages")}</span>
                </div>
                {client.packages.some((p) => !p.isActive) && (
                  <button
                    onClick={() => setShowExpiredPkgs(!showExpiredPkgs)}
                    className="text-xs font-medium text-admin hover:underline"
                  >
                    {showExpiredPkgs ? t("hideExpired") : t("showExpired")}
                  </button>
                )}
              </div>
              {client.packages.filter((p) => showExpiredPkgs || p.isActive).length > 0 ? (
                <div className="space-y-2.5">
                  {client.packages.filter((p) => showExpiredPkgs || p.isActive).map((pkg) => (
                    <div
                      key={pkg.id}
                      className={cn(
                        "rounded-lg border p-3.5 transition-colors",
                        pkg.isActive
                          ? "border-border/60 bg-card"
                          : "border-border/40 bg-surface/30 opacity-60",
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{pkg.name}</p>
                            {pkg.status === "ACTIVE" && pkg.isActive && (
                              <Badge className="bg-green-100 text-[10px] text-green-700">{tc("active")}</Badge>
                            )}
                            {pkg.status === "ACTIVE" && !pkg.isActive && (
                              <Badge variant="secondary" className="text-[10px]">{t("expired")}</Badge>
                            )}
                            {pkg.status === "PENDING_PAYMENT" && (
                              <Badge className="bg-amber-100 text-[10px] text-amber-700">Pago pendiente</Badge>
                            )}
                            {pkg.status === "PAYMENT_FAILED" && (
                              <Badge className="bg-red-100 text-[10px] text-red-700">Pago fallido</Badge>
                            )}
                            {pkg.status === "DISPUTED" && (
                              <Badge className="bg-orange-100 text-[10px] text-orange-700">En disputa</Badge>
                            )}
                            {pkg.status === "REVOKED" && (
                              <Badge className="bg-red-100 text-[10px] text-red-700">
                                Revocado{pkg.revokedReason ? ` · ${pkg.revokedReason}` : ""}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {pkg.isActive ? t("expires") : t("expired")} {formatDate(pkg.expiresAt, locale)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-lg font-bold">
                            {pkg.creditsRemaining === -1 ? "∞" : pkg.creditsRemaining}
                          </p>
                          <p className="text-[10px] text-muted">{t("credits")}</p>
                        </div>
                      </div>
                      {pkg.isActive && pkg.creditsRemaining !== -1 && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                            <div
                              className="h-full rounded-full bg-admin"
                              style={{
                                width: `${pkg.creditsTotal ? Math.max(2, (pkg.creditsRemaining / pkg.creditsTotal) * 100) : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted/60">{t("noPackages")}</p>
              )}
            </CardContent>
          </Card>

          {/* Debts */}
          {client.debts && client.debts.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-semibold">Deudas y contracargos</span>
                  <Badge className="bg-red-100 text-[10px] text-red-700">
                    {client.debts.filter((d) => d.status === "OPEN").length} abierta(s)
                  </Badge>
                </div>
                <div className="space-y-2.5">
                  {client.debts.map((d) => (
                    <div
                      key={d.id}
                      className={cn(
                        "rounded-lg border p-3.5 transition-colors",
                        d.status === "OPEN"
                          ? "border-red-200 bg-red-50/40"
                          : "border-border/40 bg-surface/30 opacity-70",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-sm font-bold">
                              {formatCurrency(d.amount, d.currency, locale)}
                            </p>
                            {d.status === "OPEN" && (
                              <Badge className="bg-red-100 text-[10px] text-red-700">Abierta</Badge>
                            )}
                            {d.status === "PAID" && (
                              <Badge className="bg-green-100 text-[10px] text-green-700">Pagada</Badge>
                            )}
                            {d.status === "FORGIVEN" && (
                              <Badge variant="secondary" className="text-[10px]">Perdonada</Badge>
                            )}
                            {d.status === "DISPUTED" && (
                              <Badge className="bg-orange-100 text-[10px] text-orange-700">En disputa</Badge>
                            )}
                            <span className="text-[10px] uppercase tracking-wider text-muted">
                              {d.reason}
                            </span>
                          </div>
                          {d.userPackageName && (
                            <p className="mt-0.5 text-xs text-muted">
                              Paquete: {d.userPackageName}
                            </p>
                          )}
                          {d.notes && (
                            <p className="mt-1 text-[11px] text-muted">{d.notes}</p>
                          )}
                          <p className="mt-1 text-[10px] text-muted/70">
                            {format(new Date(d.createdAt), "d MMM yyyy · HH:mm", { locale: dateLocale })}
                            {d.resolvedAt &&
                              ` · Resuelta ${format(new Date(d.resolvedAt), "d MMM", { locale: dateLocale })}${d.resolvedByName ? ` por ${d.resolvedByName}` : ""}`}
                          </p>
                        </div>
                        {d.status === "OPEN" && (
                          <div className="flex shrink-0 flex-col gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-[11px]"
                              disabled={resolveDebtMutation.isPending}
                              onClick={() =>
                                resolveDebtMutation.mutate({ debtId: d.id, action: "paid" })
                              }
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Pagada
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-[11px] text-muted"
                              disabled={resolveDebtMutation.isPending}
                              onClick={() =>
                                resolveDebtMutation.mutate({ debtId: d.id, action: "forgiven" })
                              }
                            >
                              Perdonar
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Subscriptions */}
          {client.subscriptions.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <CalendarSync className="h-4 w-4 text-admin" />
                  <span className="text-sm font-semibold">{t("subscriptions")}</span>
                </div>
                <div className="space-y-2.5">
                  {client.subscriptions.map((sub) => {
                    const badge = SUB_STATUS_BADGE[sub.status] ?? { label: sub.status, variant: "secondary" as const };
                    const periodEnd = format(new Date(sub.currentPeriodEnd), "d MMM yyyy", { locale: dateLocale });

                    return (
                      <div
                        key={sub.id}
                        className={cn(
                          "rounded-lg border p-3.5 transition-colors",
                          sub.status === "canceled"
                            ? "border-border/40 bg-surface/30 opacity-60"
                            : "border-border/60 bg-card",
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">{sub.package.name}</p>
                              <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                              {sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
                                <Badge variant="warning" className="text-[10px]">{t("cancelsOn", { date: periodEnd })}</Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted">
                              {formatCurrency(sub.package.price, sub.package.currency, locale)}/{sub.package.recurringInterval === "year" ? ta("yearInterval") : ta("monthInterval")}
                              {" · "}{t("nextCharge")}: {periodEnd}
                            </p>
                            {sub.status === "paused" && sub.resumesAt && (
                              <p className="mt-0.5 text-[11px] text-amber-600">
                                {t("resumesOn", { date: format(new Date(sub.resumesAt), "d MMM", { locale: dateLocale }) })}
                              </p>
                            )}
                          </div>
                          {sub.status !== "canceled" && (
                            <div className="flex shrink-0 gap-1">
                              {sub.status === "paused" ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={subActionMutation.isPending}
                                  onClick={() => subActionMutation.mutate({ subscriptionId: sub.stripeSubscriptionId, action: "resume" })}
                                  title={t("resume")}
                                >
                                  <Play className="h-3.5 w-3.5" />
                                </Button>
                              ) : (sub.status === "active" || sub.status === "past_due") ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={subActionMutation.isPending}
                                  onClick={() => setPauseSubDialog(sub)}
                                  title={t("pause")}
                                >
                                  <Pause className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                              {!sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  disabled={subActionMutation.isPending}
                                  onClick={() => subActionMutation.mutate({ subscriptionId: sub.stripeSubscriptionId, action: "cancel" })}
                                  title={t("cancelSub")}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upcoming bookings */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-semibold">{t("upcomingClasses")}</span>
                {client.upcomingBookings.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {client.upcomingBookings.length}
                  </Badge>
                )}
              </div>
              {client.upcomingBookings.length > 0 ? (
                <div className="space-y-2">
                  {client.upcomingBookings.map((b) => (
                    <Link
                      key={b.id}
                      href={`/admin/class/${b.classId}`}
                      className="flex items-center gap-3 rounded-lg border border-border/40 bg-card px-4 py-3 transition-colors hover:bg-surface/50"
                    >
                      <div
                        className="h-9 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: b.classColor || "var(--color-admin)" }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{b.className}</p>
                        <p className="text-xs text-muted">
                          {b.coachName} · {b.roomName}
                          {b.spotNumber ? ` · Spot ${b.spotNumber}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium">
                          {format(new Date(b.startsAt), "d MMM", { locale: dateLocale })}
                        </p>
                        <p className="text-xs text-muted">
                          {format(new Date(b.startsAt), "h:mm a")}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted/40" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted/60">{t("noUpcomingBookings")}</p>
              )}
            </CardContent>
          </Card>

          {/* Revenue summary */}
          {client.revenueSummary && (
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold">{t("revenueSummary")}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border/40 bg-surface/30 p-3 text-center">
                    <p className="font-mono text-lg font-bold text-emerald-700">
                      {formatCurrency(client.revenueSummary.totalHistoric)}
                    </p>
                    <p className="text-[10px] text-muted">{t("totalHistoric")}</p>
                    <p className="text-[10px] text-muted">{client.revenueSummary.transactionsCount} {t("payments")}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-surface/30 p-3 text-center">
                    <p className="font-mono text-lg font-bold">
                      {formatCurrency(client.revenueSummary.totalThisYear)}
                    </p>
                    <p className="text-[10px] text-muted">{t("thisYear")}</p>
                    <p className="text-[10px] text-muted">{client.revenueSummary.transactionsThisYear} {t("payments")}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-surface/30 p-3 text-center">
                    <p className="font-mono text-lg font-bold">
                      {formatCurrency(client.revenueSummary.totalThisMonth)}
                    </p>
                    <p className="text-[10px] text-muted">{t("thisMonth")}</p>
                  </div>
                </div>
                {client.revenueSummary.byType.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {client.revenueSummary.byType.map((t) => (
                      <div key={t.type} className="flex items-center justify-between text-xs">
                        <span className="text-muted">{t.type}</span>
                        <span className="font-medium">{formatCurrency(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Payment history */}
          {client.paymentHistory && client.paymentHistory.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-admin" />
                    <span className="text-sm font-semibold">{t("paymentHistory")}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {client.paymentHistory.length}
                    </Badge>
                  </div>
                  {client.paymentHistory.length > 10 && (
                    <button
                      onClick={() => setShowAllPayments(!showAllPayments)}
                      className="text-xs font-medium text-admin hover:underline"
                    >
                      {showAllPayments ? t("showRecent") : t("showAll", { count: client.paymentHistory.length })}
                    </button>
                  )}
                </div>
                <div className="overflow-hidden rounded-lg border border-border/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-surface/50">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">{t("concept")}</th>
                        <th className="hidden px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted sm:table-cell">{t("method")}</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">{t("amount")}</th>
                        <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">{t("status")}</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">{t("date")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllPayments ? client.paymentHistory : client.paymentHistory.slice(0, 10)).map((p, i, arr) => (
                        <tr
                          key={p.id}
                          className={cn(
                            "transition-colors hover:bg-surface/30",
                            i < arr.length - 1 && "border-b border-border/30",
                          )}
                        >
                          <td className="px-4 py-2.5">
                            {p.itemName && p.itemHref ? (
                              <Link href={p.itemHref} className="text-sm font-medium hover:text-admin hover:underline">
                                {p.itemName}
                              </Link>
                            ) : (
                              <p className="text-sm font-medium">{p.concept || p.typeLabel}</p>
                            )}
                            <p className="text-[10px] text-muted">{p.typeLabel}{p.processedBy !== "Sistema" ? ` · ${p.processedBy}` : ""}</p>
                          </td>
                          <td className="hidden px-4 py-2.5 sm:table-cell">
                            <span className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                              p.method === "Stripe" ? "bg-blue-50 text-blue-700" :
                              p.method === "TPV" ? "bg-emerald-50 text-emerald-700" :
                              "bg-amber-50 text-amber-700",
                            )}>
                              {p.method}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {p.status === "succeeded" ? (
                              <span className="text-[10px] font-medium text-emerald-700">✓ {t("paid")}</span>
                            ) : p.status === "failed" ? (
                              <span className="text-[10px] font-medium text-red-700">✗ {t("failed")}</span>
                            ) : p.status === "refunded" ? (
                              <span className="text-[10px] font-medium text-stone-500">↩ {t("refunded")}</span>
                            ) : (
                              <span className="text-[10px] font-medium text-amber-700">● {t("pending")}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted">
                            {format(new Date(p.createdAt), "d MMM yyyy", { locale: dateLocale })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Past bookings */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-muted" />
                  <span className="text-sm font-semibold">{t("activityHistory")}</span>
                </div>
                {client.pastBookings.length > 10 && (
                  <button
                    onClick={() => setShowAllHistory(!showAllHistory)}
                    className="text-xs font-medium text-admin hover:underline"
                  >
                    {showAllHistory ? t("showRecent") : t("showAll", { count: client.pastBookings.length })}
                  </button>
                )}
              </div>
              {client.pastBookings.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-surface/50">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                          {t("class")}
                        </th>
                        <th className="hidden px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted sm:table-cell">
                          {t("coach")}
                        </th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                          {t("date")}
                        </th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">
                          {t("attendance")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllHistory ? client.pastBookings : client.pastBookings.slice(0, 10)).map((b, i, arr) => {
                        const statusInfo = STATUS_MAP[b.status] || STATUS_MAP.CONFIRMED;
                        const StatusIcon = statusInfo.icon;
                        const canToggle = b.status !== "CANCELLED";
                        return (
                          <tr
                            key={b.id}
                            className={cn(
                              "transition-colors hover:bg-surface/30",
                              i < arr.length - 1 && "border-b border-border/30",
                            )}
                          >
                            <td className="px-4 py-2.5">
                              <Link
                                href={`/admin/class/${b.classId}`}
                                className="flex items-center gap-2 hover:underline"
                              >
                                <div
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: b.classColor || "#9ca3af" }}
                                />
                                <span className="font-medium">{b.className}</span>
                              </Link>
                            </td>
                            <td className="hidden px-4 py-2.5 text-muted sm:table-cell">
                              {b.coachName || "—"}
                            </td>
                            <td className="px-4 py-2.5 text-muted">
                              {format(new Date(b.startsAt), "d MMM yyyy", { locale: dateLocale })}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                {canToggle ? (
                                  <>
                                    <button
                                      onClick={() => attendanceMutation.mutate({ bookingId: b.id, status: "ATTENDED" })}
                                      disabled={attendanceMutation.isPending}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                                        b.status === "ATTENDED"
                                          ? "bg-green-100 text-green-700"
                                          : "bg-surface text-muted hover:bg-green-50 hover:text-green-600",
                                      )}
                                      title={t("markAttended")}
                                    >
                                      <CheckCircle2 className="h-3 w-3" />
                                      {tc("yes")}
                                    </button>
                                    <button
                                      onClick={() => attendanceMutation.mutate({ bookingId: b.id, status: "NO_SHOW" })}
                                      disabled={attendanceMutation.isPending}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                                        b.status === "NO_SHOW"
                                          ? "bg-red-50 text-red-600"
                                          : "bg-surface text-muted hover:bg-red-50 hover:text-red-500",
                                      )}
                                      title={t("markNoShow")}
                                    >
                                      <XCircle className="h-3 w-3" />
                                      {tc("no")}
                                    </button>
                                  </>
                                ) : (
                                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", statusInfo.color)}>
                                    <StatusIcon className="h-3 w-3" />
                                    {statusInfo.label}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted/60">{t("noActivityHistory")}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Pause subscription dialog */}
      <Dialog open={!!pauseSubDialog} onOpenChange={(o) => !o && setPauseSubDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("pauseSubscription")}</DialogTitle>
          </DialogHeader>
          {pauseSubDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted">{pauseSubDialog.package.name}</p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">{t("pauseDays")}</label>
                <Input type="number" min={1} max={90} value={pauseDays} onChange={(e) => setPauseDays(e.target.value)} />
                <p className="mt-1 text-[11px] text-muted">{t("autoResume")}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPauseSubDialog(null)}>{tc("cancel")}</Button>
                <Button
                  className="flex-1"
                  disabled={subActionMutation.isPending}
                  onClick={() => {
                    const days = parseInt(pauseDays, 10) || 14;
                    const resumesAt = new Date(Date.now() + days * 86400000).toISOString();
                    subActionMutation.mutate({ subscriptionId: pauseSubDialog.stripeSubscriptionId, action: "pause", resumesAt });
                  }}
                >
                  {subActionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
                  {t("pause")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Grant manual prize dialog */}
      <Dialog open={!!prizeDialog} onOpenChange={(o) => { if (!o) { setPrizeDialog(null); setPrizeText(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-500" />
              {t("grantPrize")}
            </DialogTitle>
          </DialogHeader>
          {prizeDialog && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-surface/50 p-3">
                <span className="text-2xl">{prizeDialog.icon}</span>
                <div>
                  <p className="text-sm font-semibold">{prizeDialog.name}</p>
                  <p className="text-xs text-muted">{prizeDialog.description}</p>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  {t("prizeLabel")}
                </label>
                <Input
                  value={prizeText}
                  onChange={(e) => setPrizeText(e.target.value)}
                  placeholder={t("prizePlaceholder")}
                />
                <p className="mt-1 text-[11px] text-muted">
                  {t("prizeHelp")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setPrizeDialog(null); setPrizeText(""); }}>
                  {tc("cancel")}
                </Button>
                <Button
                  className="flex-1 bg-amber-500 hover:bg-amber-600"
                  disabled={!prizeText.trim() || grantPrizeMutation.isPending}
                  onClick={() =>
                    grantPrizeMutation.mutate({
                      achievementKey: prizeDialog.key,
                      rewardText: prizeText.trim(),
                    })
                  }
                >
                  {grantPrizeMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Gift className="mr-2 h-4 w-4" />
                  )}
                  {t("grant")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
