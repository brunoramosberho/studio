"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Calendar,
  MapPin,
  ChevronDown,
  X,
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, isAfter, isBefore } from "date-fns";
import { es } from "date-fns/locale";
import type { PosCustomer } from "@/store/pos-store";
import { useTranslations } from "next-intl";

interface ClassRaw {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  classType: {
    id: string;
    name: string;
    color: string | null;
    duration: number;
  };
  coach: {
    name: string | null;
    user?: { name: string | null; image: string | null };
  } | null;
  room: {
    name: string | null;
    maxCapacity: number;
    studio: { name: string | null; id: string };
  };
  _count?: { bookings?: number; waitlist?: number };
}

interface ClassResult extends ClassRaw {
  spotsLeft: number;
}

interface CreditCheckResult {
  hasCredits: boolean;
  packageName?: string;
  packageId?: string;
}

interface ClassPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: PosCustomer;
  onClassSelected: (cls: ClassResult, creditInfo: CreditCheckResult) => void;
}

export function ClassPicker({
  open,
  onOpenChange,
  customer,
  onClassSelected,
}: ClassPickerProps) {
  const t = useTranslations("pos");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [selectedClass, setSelectedClass] = useState<ClassResult | null>(null);
  const [checkingCredits, setCheckingCredits] = useState(false);

  const now = useMemo(() => new Date(), []);
  const fromDate = dateFilter || now.toISOString();

  const { data: classes = [], isLoading } = useQuery<ClassResult[]>({
    queryKey: ["pos-classes", tab, dateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tab === "upcoming") {
        params.set("from", dateFilter || now.toISOString());
      } else {
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        params.set("from", thirtyDaysAgo.toISOString());
        params.set("to", now.toISOString());
      }
      const res = await fetch(`/api/classes?${params.toString()}`);
      if (!res.ok) return [];
      const raw: ClassRaw[] = await res.json();
      return raw.map((c) => ({
        ...c,
        spotsLeft: (c.room?.maxCapacity ?? 0) - (c._count?.bookings ?? 0),
      }));
    },
    enabled: open,
    staleTime: 15_000,
  });

  const locations = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((c) => {
      if (c.room?.studio) {
        map.set(c.room.studio.id, c.room.studio.name ?? t("noName"));
      }
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [classes]);

  const filtered = useMemo(() => {
    let result = classes.filter((c) => c.status === "SCHEDULED");
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.classType.name.toLowerCase().includes(q) ||
          c.coach?.name?.toLowerCase().includes(q) ||
          c.coach?.user?.name?.toLowerCase().includes(q),
      );
    }
    if (locationFilter) {
      result = result.filter((c) => c.room?.studio?.id === locationFilter);
    }
    return result;
  }, [classes, search, locationFilter]);

  async function handleSelectClass(cls: ClassResult) {
    setSelectedClass(cls);
    setCheckingCredits(true);
    try {
      const res = await fetch(
        `/api/admin/pos/customer-credits?customerId=${customer.id}&classTypeId=${cls.classType.id}`,
      );
      if (!res.ok) {
        onClassSelected(cls, { hasCredits: false });
        return;
      }
      const data: CreditCheckResult = await res.json();
      onClassSelected(cls, data);
    } catch {
      onClassSelected(cls, { hasCredits: false });
    } finally {
      setCheckingCredits(false);
      setSelectedClass(null);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("selectClassTitle")}</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted/50" />
            <input
              type="text"
              placeholder={t("searchClass")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/50"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted/50" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent text-xs text-foreground outline-none"
              placeholder={t("startDate")}
            />
          </div>
          {locations.length > 1 && (
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted/50" />
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="bg-transparent text-xs text-foreground outline-none"
              >
                <option value="">{t("location")}</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setTab("upcoming")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "upcoming"
                ? "bg-admin/10 text-admin"
                : "text-muted hover:bg-surface",
            )}
          >
            <ArrowRight className="h-3 w-3" />
            {t("upcoming")}
          </button>
          <button
            onClick={() => setTab("past")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "past"
                ? "bg-admin/10 text-admin"
                : "text-muted hover:bg-surface",
            )}
          >
            <ArrowLeft className="h-3 w-3" />
            {t("past")}
          </button>
        </div>

        {/* Class list */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              {t("noClassesFound")}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((cls) => {
                const isSelected = selectedClass?.id === cls.id;
                return (
                  <button
                    key={cls.id}
                    onClick={() => handleSelectClass(cls)}
                    disabled={checkingCredits}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      isSelected
                        ? "bg-admin/5 ring-1 ring-admin/20"
                        : "hover:bg-surface",
                    )}
                  >
                    <div
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{
                        backgroundColor: cls.classType.color ?? "var(--color-admin)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {cls.classType.name}
                      </p>
                      <p className="text-xs text-muted">
                        {format(new Date(cls.startsAt), "EEE d MMM · HH:mm", {
                          locale: es,
                        })}
                        {" · "}
                        {cls.coach?.name ?? cls.coach?.user?.name ?? t("noCoach")}
                        {cls.room?.studio?.name && ` · ${cls.room.studio.name}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "text-xs font-medium",
                          cls.spotsLeft <= 0
                            ? "text-red-500"
                            : cls.spotsLeft <= 3
                              ? "text-orange-500"
                              : "text-green-600",
                        )}
                      >
                        {cls.spotsLeft <= 0
                          ? t("full")
                          : `${cls.spotsLeft} ${t("spots")}`}
                      </p>
                    </div>
                    {isSelected && checkingCredits && (
                      <Loader2 className="h-4 w-4 animate-spin text-admin" />
                    )}
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
