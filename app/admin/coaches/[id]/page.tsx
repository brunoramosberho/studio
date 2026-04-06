"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronRight,
  CalendarDays,
  TrendingUp,
  Users,
  DollarSign,
  Clock,
  Target,
  Plus,
  Trash2,
  Pencil,
  X,
  Loader2,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Mail,
  Phone,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ClassEntry {
  id: string;
  startsAt: string;
  endsAt: string;
  status?: string;
  classTypeName: string;
  classTypeColor: string;
  classTypeId: string;
  roomName: string;
  studioName: string;
  capacity: number;
  booked: number;
  occupancy: number;
}

interface PayRate {
  id: string;
  type: "MONTHLY_FIXED" | "PER_CLASS" | "PER_STUDENT" | "OCCUPANCY_TIER";
  amount: number;
  currency: string;
  classTypeId: string | null;
  classType: { id: string; name: string; color: string } | null;
  occupancyTiers: { min: number; max: number; amount: number }[] | null;
  bonusMultiplier: number;
  bonusDays: number[] | null;
  bonusTags: string[];
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
}

interface TypeBreakdown {
  id: string;
  name: string;
  color: string;
  count: number;
  students: number;
}

interface CoachDetail {
  id: string;
  userId: string;
  bio: string | null;
  specialties: string[];
  photoUrl: string | null;
  color: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    phone: string | null;
    instagramUser: string | null;
    createdAt: string;
  };
  payRates: PayRate[];
  stats: {
    classesThisMonth: number;
    classesThisYear: number;
    allTimeClasses: number;
    avgOccupancy: number;
    totalStudentsMonth: number;
    uniqueStudentsMonth: number;
    allTimeStudents: number;
    noShowRate: number;
    earningsThisMonth: {
      total: number;
      breakdown: { type: string; label: string; amount: number }[];
      currency: string;
    };
  };
  typeBreakdown: TypeBreakdown[];
  upcomingClasses: ClassEntry[];
  recentClasses: ClassEntry[];
}

const PAY_RATE_LABELS: Record<string, string> = {
  MONTHLY_FIXED: "Sueldo fijo mensual",
  PER_CLASS: "Por clase dada",
  PER_STUDENT: "Por alumno",
  OCCUPANCY_TIER: "Bono por ocupación",
};

const PAY_RATE_ICONS: Record<string, string> = {
  MONTHLY_FIXED: "💰",
  PER_CLASS: "📋",
  PER_STUDENT: "👤",
  OCCUPANCY_TIER: "📊",
};

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  accent?: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold">{value}</p>
            {sub && <p className="text-[10px] text-muted">{sub}</p>}
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accent || "bg-admin/10")}>
            <Icon className={cn("h-5 w-5", accent ? "text-white" : "text-admin")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OccupancyBar({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const color =
    value >= 70 ? "bg-green-500" :
    value >= 30 ? "bg-amber-400" :
    "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className={cn("flex-1 rounded-full bg-surface", size === "sm" ? "h-1.5" : "h-2")}>
        <div
          className={cn("rounded-full transition-all", color, size === "sm" ? "h-1.5" : "h-2")}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className={cn("font-semibold tabular-nums text-foreground", size === "sm" ? "text-[10px]" : "text-xs")}>
        {value}%
      </span>
    </div>
  );
}

function formatCurrency(amount: number, currency: string = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

function AddPayRateForm({
  coachId,
  classTypes,
  onDone,
}: {
  coachId: string;
  classTypes: { id: string; name: string; color: string }[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>("PER_CLASS");
  const [amount, setAmount] = useState("");
  const [classTypeId, setClassTypeId] = useState<string>("all");
  const [tiers, setTiers] = useState([
    { min: 0, max: 49, amount: 0 },
    { min: 50, max: 79, amount: 0 },
    { min: 80, max: 99, amount: 0 },
    { min: 100, max: 100, amount: 0 },
  ]);
  const [currency, setCurrency] = useState("MXN");
  const [bonusMultiplier, setBonusMultiplier] = useState("1");
  const [bonusDays, setBonusDays] = useState<number[]>([]);
  const [bonusTag, setBonusTag] = useState("");
  const [bonusTags, setBonusTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/coaches/${coachId}/pay-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al crear");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coach", coachId] });
      toast.success("Tarifa agregada");
      onDone();
    },
    onError: () => toast.error("Error al agregar tarifa"),
  });

  function addTier() {
    const last = tiers[tiers.length - 1];
    if (last && last.max < 100) {
      setTiers([...tiers, { min: last.max + 1, max: 100, amount: 0 }]);
    }
  }

  function removeTier(idx: number) {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== idx));
  }

  function updateTier(idx: number, field: "min" | "max" | "amount", value: number) {
    const next = [...tiers];
    next[idx] = { ...next[idx], [field]: value };
    setTiers(next);
  }

  function toggleDay(day: number) {
    setBonusDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  }

  function addTag() {
    const tag = bonusTag.trim();
    if (tag && !bonusTags.includes(tag)) {
      setBonusTags([...bonusTags, tag]);
      setBonusTag("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mult = parseFloat(bonusMultiplier) || 1;
    const data: Record<string, unknown> = {
      type,
      amount: parseFloat(amount) || 0,
      currency,
      classTypeId: classTypeId === "all" ? null : classTypeId,
      bonusMultiplier: mult > 1 ? mult : 1,
      bonusDays: mult > 1 && bonusDays.length > 0 ? bonusDays : null,
      bonusTags: mult > 1 ? bonusTags : [],
      notes: notes || null,
    };
    if (type === "OCCUPANCY_TIER") {
      data.occupancyTiers = tiers.filter((t) => t.amount > 0);
      data.amount = 0;
    }
    mutation.mutate(data);
  }

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      onSubmit={handleSubmit}
      className="space-y-4 overflow-hidden border-t border-border/50 px-5 pb-5 pt-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">Tipo de compensación</label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MONTHLY_FIXED">Sueldo fijo mensual</SelectItem>
              <SelectItem value="PER_CLASS">Por clase dada</SelectItem>
              <SelectItem value="PER_STUDENT">Por alumno asistente</SelectItem>
              <SelectItem value="OCCUPANCY_TIER">Bono por ocupación</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">Aplica a</label>
          <Select value={classTypeId} onValueChange={setClassTypeId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las clases</SelectItem>
              {classTypes.map((ct) => (
                <SelectItem key={ct.id} value={ct.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ct.color }} />
                    {ct.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {type !== "OCCUPANCY_TIER" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Monto
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7"
                placeholder={type === "MONTHLY_FIXED" ? "15000" : type === "PER_CLASS" ? "300" : "50"}
                required
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {type === "MONTHLY_FIXED" && "Se suma al total del mes completo"}
              {type === "PER_CLASS" && "Se multiplica por cada clase impartida"}
              {type === "PER_STUDENT" && "Se multiplica por cada alumno que asistió"}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Moneda
            </label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-9 w-24 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MXN">MXN</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="COP">COP</SelectItem>
                <SelectItem value="ARS">ARS</SelectItem>
                <SelectItem value="CLP">CLP</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Tiers de ocupación
            </label>
            <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-[11px] text-admin" onClick={addTier}>
              <Plus className="h-3 w-3" />
              Agregar tier
            </Button>
          </div>
          <div className="space-y-2">
            {tiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    className="h-8 w-14 text-center text-xs"
                    value={tier.min}
                    onChange={(e) => updateTier(i, "min", parseInt(e.target.value) || 0)}
                  />
                  <span className="text-muted">–</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    className="h-8 w-14 text-center text-xs"
                    value={tier.max}
                    onChange={(e) => updateTier(i, "max", parseInt(e.target.value) || 0)}
                  />
                  <span className="text-[11px] text-muted">%</span>
                </div>
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8 pl-5 text-sm"
                    value={tier.amount || ""}
                    onChange={(e) => updateTier(i, "amount", parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
                <span className="text-[11px] text-muted shrink-0">/clase</span>
                {tiers.length > 1 && (
                  <button type="button" onClick={() => removeTier(i)} className="text-muted hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            Define rangos personalizados. Usa 100–100% para un bono especial por clase llena.
          </p>
        </div>
      )}

      {/* Bonus multiplier */}
      {type !== "MONTHLY_FIXED" && (
        <div className="space-y-3 rounded-lg border border-border/50 bg-surface/30 p-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Bono por día especial
            </label>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-white p-0.5">
                {[
                  { value: "1", label: "Sin bono" },
                  { value: "1.25", label: "1.25x" },
                  { value: "1.5", label: "1.5x" },
                  { value: "2", label: "2x" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setBonusMultiplier(opt.value)}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                      bonusMultiplier === opt.value
                        ? "bg-admin/10 text-admin shadow-sm"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {parseFloat(bonusMultiplier) > 1 && (
            <>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Aplica estos días
                </label>
                <div className="flex gap-1">
                  {[
                    { day: 1, label: "L" },
                    { day: 2, label: "M" },
                    { day: 3, label: "X" },
                    { day: 4, label: "J" },
                    { day: 5, label: "V" },
                    { day: 6, label: "S" },
                    { day: 0, label: "D" },
                  ].map(({ day, label }) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                        bonusDays.includes(day)
                          ? "bg-admin text-white"
                          : "bg-white text-muted hover:text-foreground border border-border/50",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                  O clases con estos tags
                </label>
                <div className="flex gap-2">
                  <Input
                    value={bonusTag}
                    onChange={(e) => setBonusTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    placeholder="ej: festivo, premium..."
                    className="h-8 flex-1 text-xs"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addTag}>
                    Agregar
                  </Button>
                </div>
                {bonusTags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {bonusTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1 text-[10px]">
                        {tag}
                        <button type="button" onClick={() => setBonusTags(bonusTags.filter((t) => t !== tag))}>
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-[11px] text-muted">
                  Si una clase cae en un día seleccionado o tiene uno de estos tags, se aplica el multiplicador {bonusMultiplier}x
                </p>
              </div>
            </>
          )}
        </div>
      )}

      <Input
        placeholder="Notas opcionales..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="text-sm"
      />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={mutation.isPending} className="gap-1.5 bg-admin text-white hover:bg-admin/90">
          {mutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Agregar tarifa
        </Button>
      </div>
    </motion.form>
  );
}

export default function CoachDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showAddRate, setShowAddRate] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const { data: coach, isLoading, error } = useQuery<CoachDetail>({
    queryKey: ["admin-coach", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/coaches/${id}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: classTypes } = useQuery<{ id: string; name: string; color: string }[]>({
    queryKey: ["class-types-simple"],
    queryFn: async () => {
      const res = await fetch("/api/class-types");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((ct: any) => ({ id: ct.id, name: ct.name, color: ct.color }));
    },
  });

  const deleteRateMutation = useMutation({
    mutationFn: async (rateId: string) => {
      const res = await fetch(`/api/admin/coaches/${id}/pay-rates`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateId }),
      });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coach", id] });
      toast.success("Tarifa eliminada");
    },
    onError: () => toast.error("Error al eliminar"),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3 py-4">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-2xl" />
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !coach) {
    return (
      <div className="mx-auto max-w-5xl py-12 text-center">
        <p className="text-muted">Coach no encontrado</p>
        <Link href="/admin/coaches">
          <Button variant="ghost" className="mt-4">Volver a coaches</Button>
        </Link>
      </div>
    );
  }

  const displayName = coach.user.name || coach.user.email;
  const initials = (coach.user.name || coach.user.email)
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const s = coach.stats;
  const earnings = s.earningsThisMonth;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2 text-sm"
      >
        <Link
          href="/admin/coaches"
          className="flex items-center gap-1.5 text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Coaches
        </Link>
        <ChevronRight className="h-3 w-3 text-muted/50" />
        <span className="font-medium text-foreground">{displayName}</span>
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
                  {(coach.photoUrl || coach.user.image) && (
                    <AvatarImage src={coach.photoUrl || coach.user.image!} />
                  )}
                  <AvatarFallback
                    className="text-xl font-bold text-white"
                    style={{ backgroundColor: coach.color }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <h2 className="mt-3 font-display text-lg font-bold">{displayName}</h2>
                {coach.user.name && (
                  <p className="text-sm text-muted">{coach.user.email}</p>
                )}
                <Badge variant="admin" className="mt-2 text-[10px]">Coach</Badge>
              </div>

              <Separator className="my-4" />

              <div className="space-y-2.5">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate text-foreground">{coach.user.email}</span>
                </div>
                {coach.user.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 shrink-0 text-muted" />
                    <span className="text-foreground">{coach.user.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 shrink-0 text-muted" />
                  <span className="text-muted">
                    Desde {format(new Date(coach.user.createdAt), "MMM yyyy", { locale: es })}
                  </span>
                </div>
                {coach.user.instagramUser && (
                  <a
                    href={`https://instagram.com/${coach.user.instagramUser}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 text-sm text-muted transition-colors hover:text-foreground"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
                    @{coach.user.instagramUser}
                  </a>
                )}
              </div>

              {coach.specialties.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Especialidades</p>
                    <div className="flex flex-wrap gap-1.5">
                      {coach.specialties.map((sp) => (
                        <Badge key={sp} variant="secondary" className="text-xs">{sp}</Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Earnings this month */}
          <Card className="border-green-100 bg-gradient-to-br from-green-50/50 to-transparent">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold">Costo este mes</span>
                </div>
              </div>
              <p className="mt-2 font-display text-3xl font-bold text-green-700">
                {formatCurrency(earnings.total, earnings.currency)}
              </p>
              {earnings.breakdown.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {earnings.breakdown.map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted">{b.label}</span>
                      <span className="font-semibold text-foreground">{formatCurrency(b.amount, earnings.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
              {earnings.breakdown.length === 0 && (
                <p className="mt-2 text-xs text-muted">
                  No hay tarifas configuradas. Agrega una para calcular costos.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Class type breakdown */}
          {coach.typeBreakdown.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-admin" />
                  <span className="text-sm font-semibold">Desglose este mes</span>
                </div>
                <div className="space-y-2.5">
                  {coach.typeBreakdown.map((tb) => {
                    const avg = tb.count > 0 ? Math.round(tb.students / tb.count) : 0;
                    return (
                      <div key={tb.id} className="flex items-center gap-2.5">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: tb.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{tb.name}</p>
                          <p className="text-[11px] text-muted">
                            ~{avg} alumnos/clase
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-bold">{tb.count}</p>
                          <p className="text-[10px] text-muted">clases</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
            <StatCard
              label="Clases este mes"
              value={s.classesThisMonth}
              icon={CalendarDays}
            />
            <StatCard
              label="Ocupación"
              value={`${s.avgOccupancy}%`}
              icon={Target}
              sub={`${s.totalStudentsMonth} alumnos total`}
            />
            <StatCard
              label="Alumnos únicos"
              value={s.uniqueStudentsMonth}
              icon={Users}
              sub={`${s.allTimeStudents} histórico`}
            />
            <StatCard
              label="No-show"
              value={`${s.noShowRate}%`}
              icon={AlertCircle}
              sub={`${s.allTimeClasses} clases totales`}
            />
          </div>

          {/* Pay rates */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-admin" />
                  <span className="text-sm font-semibold">Tarifas de compensación</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setShowAddRate(!showAddRate)}
                >
                  {showAddRate ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {showAddRate ? "Cancelar" : "Agregar"}
                </Button>
              </div>

              {coach.payRates.length === 0 && !showAddRate && (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <DollarSign className="h-8 w-8 text-muted/30" />
                  <p className="text-sm text-muted">Sin tarifas configuradas</p>
                  <p className="text-xs text-muted/70">
                    Agrega tarifas para calcular automáticamente los costos del coach
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 gap-1 text-xs"
                    onClick={() => setShowAddRate(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Agregar primera tarifa
                  </Button>
                </div>
              )}

              {coach.payRates.length > 0 && (
                <div className="space-y-2">
                  {coach.payRates.map((rate) => (
                    <div
                      key={rate.id}
                      className="group flex items-start gap-3 rounded-lg border border-border/50 bg-white px-4 py-3 transition-colors hover:bg-surface/30"
                    >
                      <span className="mt-0.5 text-lg">{PAY_RATE_ICONS[rate.type]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{PAY_RATE_LABELS[rate.type]}</p>
                          {rate.classType && (
                            <Badge
                              className="text-[10px]"
                              style={{
                                backgroundColor: `${rate.classType.color}15`,
                                color: rate.classType.color,
                              }}
                            >
                              {rate.classType.name}
                            </Badge>
                          )}
                        </div>
                        {rate.type === "OCCUPANCY_TIER" && rate.occupancyTiers ? (
                          <div className="mt-1 space-y-0.5">
                            {(rate.occupancyTiers as { min: number; max: number; amount: number }[]).map((tier, i) => (
                              <p key={i} className="text-xs text-muted">
                                {tier.min}%–{tier.max}%: <span className="font-semibold text-foreground">{formatCurrency(tier.amount)}</span>/clase
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted">
                            {formatCurrency(rate.amount, rate.currency)}
                            {rate.type === "PER_CLASS" && " por clase"}
                            {rate.type === "PER_STUDENT" && " por alumno"}
                            {rate.type === "MONTHLY_FIXED" && " mensual"}
                          </p>
                        )}
                        {rate.bonusMultiplier > 1 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <Badge className="bg-blue-50 text-[10px] text-blue-700 border-0">
                              {rate.bonusMultiplier}x
                            </Badge>
                            {rate.bonusDays && (rate.bonusDays as number[]).length > 0 && (
                              <span className="text-[11px] text-muted">
                                {(rate.bonusDays as number[]).map((d) => ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][d]).join(", ")}
                              </span>
                            )}
                            {rate.bonusTags.length > 0 && (
                              <span className="text-[11px] text-muted">
                                {rate.bonusDays && (rate.bonusDays as number[]).length > 0 ? " + " : ""}
                                tags: {rate.bonusTags.join(", ")}
                              </span>
                            )}
                          </div>
                        )}
                        {rate.notes && (
                          <p className="mt-1 text-[11px] italic text-muted">{rate.notes}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                        onClick={() => deleteRateMutation.mutate(rate.id)}
                        disabled={deleteRateMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <AnimatePresence>
                {showAddRate && (
                  <AddPayRateForm
                    coachId={coach.id}
                    classTypes={classTypes ?? coach.typeBreakdown.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
                    onDone={() => setShowAddRate(false)}
                  />
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Upcoming classes */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-semibold">Próximas clases</span>
                  {coach.upcomingClasses.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {coach.upcomingClasses.length}
                    </Badge>
                  )}
                </div>
                {coach.upcomingClasses.length > 5 && (
                  <button
                    onClick={() => setShowAllUpcoming(!showAllUpcoming)}
                    className="text-xs font-medium text-admin hover:underline"
                  >
                    {showAllUpcoming ? "Ver menos" : `Ver todas (${coach.upcomingClasses.length})`}
                  </button>
                )}
              </div>
              {coach.upcomingClasses.length > 0 ? (
                <div className="space-y-2">
                  {(showAllUpcoming ? coach.upcomingClasses : coach.upcomingClasses.slice(0, 5)).map((cls) => (
                    <Link
                      key={cls.id}
                      href={`/admin/class/${cls.id}`}
                      className="flex items-center gap-3 rounded-lg border border-border/40 bg-white px-4 py-3 transition-colors hover:bg-surface/50"
                    >
                      <div
                        className="h-9 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: cls.classTypeColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{cls.classTypeName}</p>
                        <p className="text-xs text-muted">
                          {cls.roomName} · {cls.studioName}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium">
                          {format(new Date(cls.startsAt), "d MMM", { locale: es })}
                        </p>
                        <p className="text-xs text-muted">
                          {format(new Date(cls.startsAt), "h:mm a")}
                        </p>
                      </div>
                      <div className="w-16 shrink-0">
                        <OccupancyBar value={cls.occupancy} size="sm" />
                        <p className="mt-0.5 text-center text-[10px] text-muted">
                          {cls.booked}/{cls.capacity}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted/40" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted/60">Sin clases próximas</p>
              )}
            </CardContent>
          </Card>

          {/* Recent classes (history) */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted" />
                  <span className="text-sm font-semibold">Historial de clases</span>
                </div>
                {coach.recentClasses.length > 10 && (
                  <button
                    onClick={() => setShowAllHistory(!showAllHistory)}
                    className="text-xs font-medium text-admin hover:underline"
                  >
                    {showAllHistory ? "Ver recientes" : `Ver todas (${coach.recentClasses.length})`}
                  </button>
                )}
              </div>
              {coach.recentClasses.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-surface/50">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Clase
                        </th>
                        <th className="hidden px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted sm:table-cell">
                          Sala
                        </th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Fecha
                        </th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Ocupación
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllHistory ? coach.recentClasses : coach.recentClasses.slice(0, 10)).map((cls, i, arr) => (
                        <tr
                          key={cls.id}
                          className={cn(
                            "transition-colors hover:bg-surface/30",
                            i < arr.length - 1 && "border-b border-border/30",
                          )}
                        >
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/admin/class/${cls.id}`}
                              className="flex items-center gap-2 hover:underline"
                            >
                              <div
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: cls.classTypeColor }}
                              />
                              <span className="font-medium">{cls.classTypeName}</span>
                            </Link>
                          </td>
                          <td className="hidden px-4 py-2.5 text-muted sm:table-cell">
                            {cls.roomName}
                          </td>
                          <td className="px-4 py-2.5 text-muted">
                            {format(new Date(cls.startsAt), "d MMM yyyy", { locale: es })}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-mono text-xs font-semibold">
                                {cls.booked}/{cls.capacity}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                  cls.occupancy >= 70 ? "bg-green-50 text-green-700" :
                                  cls.occupancy >= 30 ? "bg-amber-50 text-amber-700" :
                                  "bg-red-50 text-red-600",
                                )}
                              >
                                {cls.occupancy}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted/60">Sin historial de clases</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
