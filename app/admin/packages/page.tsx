"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Package,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Gift,
  Layers,
  CalendarSync,
  Video,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency, cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/components/tenant-provider";
import { SectionTabs } from "@/components/admin/section-tabs";
import { PRICING_TABS } from "@/components/admin/section-tab-configs";

interface CreditAllocation {
  classTypeId: string;
  credits: number;
  classType: { id: string; name: string };
}

interface PackageData {
  id: string;
  name: string;
  description: string | null;
  type: "OFFER" | "PACK" | "SUBSCRIPTION" | "ON_DEMAND_SUBSCRIPTION";
  credits: number | null;
  validDays: number;
  price: number;
  currency: string;
  isPromo: boolean;
  isActive: boolean;
  classTypes: { id: string; name: string }[];
  creditAllocations: CreditAllocation[];
  recurringInterval: string | null;
  sortOrder: number;
  countryId: string | null;
  allowGuests: boolean;
  maxGuestsPerBooking: number | null;
  monthlyGuestPasses: number | null;
  includesOnDemand: boolean;
}

type PackageKind = PackageData["type"];

interface ClassTypeOption {
  id: string;
  name: string;
}

interface LocationCountry {
  id: string;
  code: string;
  name: string;
  cities: { id: string; name: string }[];
}

const TAB_CONFIG: { type: PackageKind; labelKey: string; icon: typeof Gift }[] = [
  { type: "OFFER", labelKey: "offers", icon: Gift },
  { type: "PACK", labelKey: "packs", icon: Layers },
  { type: "SUBSCRIPTION", labelKey: "subscriptions", icon: CalendarSync },
  { type: "ON_DEMAND_SUBSCRIPTION", labelKey: "onDemandSubscriptions", icon: Video },
];

const CURRENCIES = ["EUR", "MXN", "USD"] as const;

const RECURRING_OPTIONS = [
  { value: "month", labelKey: "monthly" },
  { value: "year", labelKey: "annual" },
] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

function formatRecurringLabel(interval: string | null, t: (key: string) => string): string {
  if (!interval) return "—";
  const lower = interval.toLowerCase();
  if (lower === "month" || lower === "monthly") return t("monthly");
  if (lower === "year" || lower === "annual" || lower === "yearly") return t("annual");
  return interval;
}

function classTypesLabel(pkg: PackageData, t: (key: string) => string): string {
  if (!pkg.classTypes?.length) return t("allDisciplinesLabel");
  return pkg.classTypes.map((c) => c.name).join(", ");
}

interface FormCreditAllocation {
  classTypeId: string;
  credits: string;
}

interface FormState {
  type: PackageKind;
  name: string;
  description: string;
  price: string;
  currency: string;
  creditsUnlimited: boolean;
  credits: string;
  perDisciplineCredits: boolean;
  creditAllocations: FormCreditAllocation[];
  validDays: string;
  recurringInterval: string;
  classTypeIds: string[];
  countryId: string;
  sortOrder: string;
  allowGuests: boolean;
  maxGuestsPerBooking: string;
  monthlyGuestPasses: string;
  includesOnDemand: boolean;
}

function emptyForm(forType: PackageKind, defaultCurrency = "EUR"): FormState {
  return {
    type: forType,
    name: "",
    description: "",
    price: "",
    currency: defaultCurrency,
    creditsUnlimited: false,
    credits: "",
    perDisciplineCredits: false,
    creditAllocations: [],
    validDays: "30",
    recurringInterval: "month",
    classTypeIds: [],
    countryId: "",
    sortOrder: "0",
    allowGuests: false,
    maxGuestsPerBooking: "",
    monthlyGuestPasses: "",
    includesOnDemand: false,
  };
}

function formFromPackage(pkg: PackageData, defaultCurrency = "EUR"): FormState {
  const hasAllocations = pkg.creditAllocations?.length > 0;
  return {
    type: pkg.type,
    name: pkg.name,
    description: pkg.description ?? "",
    price: String(pkg.price),
    currency: pkg.currency || defaultCurrency,
    creditsUnlimited: !hasAllocations && pkg.credits === null,
    credits: pkg.credits === null ? "" : String(pkg.credits),
    perDisciplineCredits: hasAllocations,
    creditAllocations: hasAllocations
      ? pkg.creditAllocations.map((a) => ({
          classTypeId: a.classTypeId,
          credits: String(a.credits),
        }))
      : [],
    validDays: String(pkg.validDays),
    recurringInterval:
      pkg.recurringInterval === "year" || pkg.recurringInterval === "annual"
        ? "year"
        : "month",
    classTypeIds: pkg.classTypes?.map((c) => c.id) ?? [],
    countryId: pkg.countryId ?? "",
    sortOrder: String(pkg.sortOrder ?? 0),
    allowGuests: pkg.allowGuests ?? false,
    maxGuestsPerBooking: pkg.maxGuestsPerBooking == null ? "" : String(pkg.maxGuestsPerBooking),
    monthlyGuestPasses: pkg.monthlyGuestPasses == null ? "" : String(pkg.monthlyGuestPasses),
    includesOnDemand: pkg.includesOnDemand ?? false,
  };
}

function buildPayload(form: FormState) {
  const price = parseFloat(form.price);
  const validDays = parseInt(form.validDays, 10);
  const sortOrder = parseInt(form.sortOrder, 10) || 0;

  const isOnDemand = form.type === "ON_DEMAND_SUBSCRIPTION";
  const useAllocations =
    !isOnDemand && form.perDisciplineCredits && form.creditAllocations.length > 0;

  const credits = isOnDemand
    ? null
    : useAllocations
      ? null
      : form.creditsUnlimited
        ? null
        : form.credits.trim() === ""
          ? null
          : parseInt(form.credits, 10);

  const creditAllocations = useAllocations
    ? form.creditAllocations
        .filter((a) => {
          const n = parseInt(a.credits, 10);
          return !Number.isNaN(n) && n > 0;
        })
        .map((a) => ({ classTypeId: a.classTypeId, credits: parseInt(a.credits, 10) }))
    : [];

  const maxGuestsPerBooking = form.allowGuests && form.maxGuestsPerBooking.trim() !== ""
    ? parseInt(form.maxGuestsPerBooking, 10)
    : null;
  const monthlyGuestPasses = form.allowGuests && form.monthlyGuestPasses.trim() !== ""
    ? parseInt(form.monthlyGuestPasses, 10)
    : null;

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    type: form.type,
    price,
    currency: form.currency,
    credits,
    validDays,
    recurringInterval:
      form.type === "SUBSCRIPTION" || form.type === "ON_DEMAND_SUBSCRIPTION"
        ? form.recurringInterval
        : null,
    classTypeIds: isOnDemand ? [] : form.classTypeIds,
    countryId: form.countryId.trim() === "" ? null : form.countryId,
    sortOrder,
    creditAllocations,
    allowGuests: isOnDemand ? false : form.allowGuests,
    maxGuestsPerBooking: maxGuestsPerBooking != null && !Number.isNaN(maxGuestsPerBooking) ? maxGuestsPerBooking : null,
    monthlyGuestPasses: monthlyGuestPasses != null && !Number.isNaN(monthlyGuestPasses) ? monthlyGuestPasses : null,
    includesOnDemand: form.type === "SUBSCRIPTION" ? form.includesOnDemand : false,
  };
}

export default function AdminPackagesPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const tenantCurrency = useCurrency();
  const [activeTab, setActiveTab] = useState<PackageKind>("OFFER");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm("OFFER", tenantCurrency.code));
  const [formError, setFormError] = useState<string | null>(null);

  const { data: packages = [], isLoading } = useQuery<PackageData[]>({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const res = await fetch("/api/packages?all=true");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: classTypes = [], isLoading: loadingClassTypes } = useQuery<ClassTypeOption[]>({
    queryKey: ["admin-packages", "class-types"],
    queryFn: async () => {
      const res = await fetch("/api/class-types");
      if (!res.ok) throw new Error("Failed to fetch class types");
      const raw: { id: string; name: string }[] = await res.json();
      return raw.map((c) => ({ id: c.id, name: c.name }));
    },
  });

  const { data: countries = [], isLoading: loadingCountries } = useQuery<LocationCountry[]>({
    queryKey: ["admin-packages", "locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations");
      if (!res.ok) throw new Error("Failed to fetch locations");
      return res.json();
    },
  });

  const filtered = useMemo(
    () => packages.filter((p) => p.type === activeTab),
    [packages, activeTab],
  );

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/packages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("errorSaving"));
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-packages"] }),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof buildPayload>) => {
      const url = editingId ? `/api/packages/${editingId}` : "/api/packages";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tc("errorSaving"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      closeDialog();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm(activeTab, tenantCurrency.code));
    setFormError(null);
  }, [activeTab, tenantCurrency.code]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(activeTab, tenantCurrency.code));
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (pkg: PackageData) => {
    setEditingId(pkg.id);
    setForm(formFromPackage(pkg, tenantCurrency.code));
    setFormError(null);
    setDialogOpen(true);
  };

  const onSubmit = () => {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError(t("nameRequired2"));
      return;
    }
    const price = parseFloat(form.price);
    if (Number.isNaN(price) || price < 0) {
      setFormError(t("validPriceRequired"));
      return;
    }
    const validDays = parseInt(form.validDays, 10);
    if (Number.isNaN(validDays) || validDays < 1) {
      setFormError(t("validDaysMin1"));
      return;
    }
    if (
      (form.type === "SUBSCRIPTION" || form.type === "ON_DEMAND_SUBSCRIPTION") &&
      !form.recurringInterval
    ) {
      setFormError(t("selectRecurringInterval"));
      return;
    }
    if (form.type !== "ON_DEMAND_SUBSCRIPTION") {
      if (form.perDisciplineCredits) {
        const validAllocations = form.creditAllocations.filter((a) => {
          const n = parseInt(a.credits, 10);
          return !Number.isNaN(n) && n > 0;
        });
        if (validAllocations.length === 0) {
          setFormError(t("addCreditsToOneDiscipline"));
          return;
        }
      } else if (!form.creditsUnlimited) {
        if (form.credits.trim() === "") {
          setFormError(t("creditsNumberOrUnlimited"));
          return;
        }
        const c = parseInt(form.credits, 10);
        if (Number.isNaN(c) || c < 0) {
          setFormError(t("creditsValidNumber"));
          return;
        }
      }
    }

    saveMutation.mutate(buildPayload(form));
  };

  const toggleClassType = (id: string) => {
    setForm((f) => ({
      ...f,
      classTypeIds: f.classTypeIds.includes(id)
        ? f.classTypeIds.filter((x) => x !== id)
        : [...f.classTypeIds, id],
    }));
  };

  const tabMeta = TAB_CONFIG.find((tb) => tb.type === activeTab)!;
  const TabIcon = tabMeta.icon;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SectionTabs tabs={PRICING_TABS} ariaLabel="Pricing sections" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("packagesAndPricing")}</h1>
          <p className="mt-1 text-muted">
            {t("packagesSubtitle")}
          </p>
        </motion.div>

        <Button onClick={openCreate} className="gap-2 bg-admin hover:bg-admin/90">
          <Plus className="h-4 w-4" />
          {tc("new")}
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.type}
              type="button"
              onClick={() => setActiveTab(tab.type)}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-medium transition-all sm:text-sm",
                activeTab === tab.type
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              <span className="truncate">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : !filtered.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
              <TabIcon className="h-6 w-6 text-muted/40" />
            </div>
            <p className="font-medium text-muted">
              {t("noItemsNow", { type: t(tabMeta.labelKey).toLowerCase() })}
            </p>
            <Button
              size="sm"
              className="gap-2 bg-admin hover:bg-admin/90"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              {t("createOne")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
          {filtered.map((pkg) => (
            <motion.div key={pkg.id} variants={fadeUp}>
              <Card className={cn(!pkg.isActive && "opacity-60")}>
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-bold">{pkg.name}</h3>
                      <Badge variant={pkg.isActive ? "success" : "secondary"}>
                        {pkg.isActive ? t("activeStatus") : t("inactiveStatus")}
                      </Badge>
                      {pkg.isPromo ? (
                        <Badge variant="outline" className="border-admin/30 text-admin">
                          {t("promo")}
                        </Badge>
                      ) : null}
                      {pkg.type === "SUBSCRIPTION" && pkg.includesOnDemand ? (
                        <Badge variant="outline" className="border-admin/30 text-admin">
                          {t("onDemandBadge")}
                        </Badge>
                      ) : null}
                    </div>
                    {pkg.description ? (
                      <p className="text-sm text-muted">{pkg.description}</p>
                    ) : null}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      <span>
                        {t("priceLabel")}:{" "}
                        <strong className="font-mono text-foreground">
                          {formatCurrency(pkg.price, pkg.currency)}
                        </strong>
                      </span>
                      {pkg.type !== "ON_DEMAND_SUBSCRIPTION" ? (
                        <span>
                          {t("creditsLabel")}:{" "}
                          <strong className="font-mono text-foreground">
                            {pkg.creditAllocations?.length > 0
                              ? pkg.creditAllocations.map((a) => `${a.credits} ${a.classType.name}`).join(", ")
                              : pkg.credits === null
                                ? t("unlimited")
                                : pkg.credits}
                          </strong>
                        </span>
                      ) : null}
                      <span>
                        {t("validityLabel")}:{" "}
                        <strong className="font-mono text-foreground">
                          {pkg.validDays} {t("daysUnit")}
                        </strong>
                      </span>
                      {pkg.type === "SUBSCRIPTION" || pkg.type === "ON_DEMAND_SUBSCRIPTION" ? (
                        <span>
                          {t("periodicityLabel")}:{" "}
                          <strong className="text-foreground">
                            {formatRecurringLabel(pkg.recurringInterval, t)}
                          </strong>
                        </span>
                      ) : null}
                    </div>

                    {pkg.type !== "ON_DEMAND_SUBSCRIPTION" ? (
                      <p className="text-xs leading-relaxed text-muted">
                        <span className="font-medium text-foreground/80">{t("disciplinesLabel")}: </span>
                        {classTypesLabel(pkg, t)}
                      </p>
                    ) : null}
                    {pkg.allowGuests && (
                      <p className="text-xs leading-relaxed text-muted">
                        <span className="font-medium text-foreground/80">Invitados: </span>
                        {pkg.maxGuestsPerBooking != null
                          ? `Máx. ${pkg.maxGuestsPerBooking} por reserva`
                          : "Sin límite por reserva"}
                        {pkg.credits === null && pkg.monthlyGuestPasses != null
                          ? ` · ${pkg.monthlyGuestPasses} pases/mes`
                          : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-stretch">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        toggleMutation.mutate({ id: pkg.id, isActive: !pkg.isActive })
                      }
                      disabled={toggleMutation.isPending}
                    >
                      {pkg.isActive ? (
                        <ToggleRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-muted" />
                      )}
                      {pkg.isActive ? t("deactivate") : t("activate")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => openEdit(pkg)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {tc("edit")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("editPackage") : t("newPackage")}</DialogTitle>
            <DialogDescription>
              {editingId
                ? t("editPackageDesc")
                : t("newPackageDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            <div>
              <p className="mb-2 text-sm font-medium">{t("typeLabel")}</p>
              <div className="flex gap-1 rounded-xl bg-surface p-1">
                {TAB_CONFIG.map((tab) => (
                  <button
                    key={tab.type}
                    type="button"
                    disabled={Boolean(editingId)}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        type: tab.type,
                        recurringInterval:
                          tab.type === "SUBSCRIPTION" || tab.type === "ON_DEMAND_SUBSCRIPTION"
                            ? f.recurringInterval || "month"
                            : "month",
                      }))
                    }
                    className={cn(
                      "flex-1 rounded-lg py-2 text-xs font-medium transition-all sm:text-[13px]",
                      form.type === tab.type
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted hover:text-foreground",
                      editingId && "cursor-not-allowed opacity-60",
                    )}
                  >
                    {t(tab.labelKey)}
                  </button>
                ))}
              </div>
              {editingId ? (
                <p className="mt-1.5 text-xs text-muted">{t("typeCannotChange")}</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-name">
                {tc("name")}
              </label>
              <Input
                id="pkg-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("namePkgPlaceholder")}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-desc">
                {t("description")}
              </label>
              <Textarea
                id="pkg-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("descPkgPlaceholder")}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-price">
                  {t("priceLabel")}
                </label>
                <Input
                  id="pkg-price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-currency">
                  {t("currency")}
                </label>
                <Input
                  id="pkg-currency"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  list="pkg-currency-options"
                  placeholder={tenantCurrency.code}
                />
                <datalist id="pkg-currency-options">
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            {form.type !== "ON_DEMAND_SUBSCRIPTION" && (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-credits">
                    {t("creditsLabel")}
                  </label>
                  <Input
                    id="pkg-credits"
                    type="number"
                    min={0}
                    disabled={form.creditsUnlimited || form.perDisciplineCredits}
                    value={form.perDisciplineCredits ? "" : form.credits}
                    onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
                    placeholder={form.perDisciplineCredits ? t("byDiscipline") : t("numberOfClasses")}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input-border accent-admin"
                    checked={form.creditsUnlimited}
                    disabled={form.perDisciplineCredits}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, creditsUnlimited: e.target.checked }))
                    }
                  />
                  {t("unlimited")}
                </label>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input-border accent-admin"
                  checked={form.perDisciplineCredits}
                  disabled={form.creditsUnlimited}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((f) => ({
                      ...f,
                      perDisciplineCredits: checked,
                      creditAllocations: checked
                        ? classTypes.map((ct) => {
                            const existing = f.creditAllocations.find((a) => a.classTypeId === ct.id);
                            return { classTypeId: ct.id, credits: existing?.credits ?? "" };
                          })
                        : [],
                    }));
                  }}
                />
                {t("perDisciplineCredits")}
              </label>

              {form.perDisciplineCredits && (
                <div className="space-y-2 rounded-xl border border-input-border/60 bg-surface/50 p-3">
                  <p className="mb-1 text-xs text-muted">
                    {t("perDisciplineHint")}
                  </p>
                  {classTypes.map((ct) => {
                    const alloc = form.creditAllocations.find((a) => a.classTypeId === ct.id);
                    return (
                      <div key={ct.id} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{ct.name}</span>
                        <Input
                          type="number"
                          min={0}
                          className="w-24"
                          value={alloc?.credits ?? ""}
                          placeholder="0"
                          onChange={(e) => {
                            const val = e.target.value;
                            setForm((f) => ({
                              ...f,
                              creditAllocations: f.creditAllocations.some((a) => a.classTypeId === ct.id)
                                ? f.creditAllocations.map((a) =>
                                    a.classTypeId === ct.id ? { ...a, credits: val } : a,
                                  )
                                : [...f.creditAllocations, { classTypeId: ct.id, credits: val }],
                            }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-days">
                  {t("validDays")}
                </label>
                <Input
                  id="pkg-days"
                  type="number"
                  min={1}
                  value={form.validDays}
                  onChange={(e) => setForm((f) => ({ ...f, validDays: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-sort">
                  {t("sortOrder")}
                </label>
                <Input
                  id="pkg-sort"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            {form.type === "SUBSCRIPTION" || form.type === "ON_DEMAND_SUBSCRIPTION" ? (
              <div>
                <p className="mb-2 text-sm font-medium">{t("periodicityLabel")}</p>
                <div className="flex gap-1 rounded-xl bg-surface p-1">
                  {RECURRING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, recurringInterval: opt.value }))
                      }
                      className={cn(
                        "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
                        form.recurringInterval === opt.value
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted hover:text-foreground",
                      )}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {form.type === "SUBSCRIPTION" ? (
              <div className="rounded-xl border border-input-border/60 bg-surface/50 p-3">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-input-border accent-admin"
                    checked={form.includesOnDemand}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, includesOnDemand: e.target.checked }))
                    }
                  />
                  <span>
                    <span className="font-medium">{t("includesOnDemandLabel")}</span>
                    <span className="ml-1 text-xs text-muted">{t("includesOnDemandHint")}</span>
                  </span>
                </label>
              </div>
            ) : null}

            {form.type !== "ON_DEMAND_SUBSCRIPTION" && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{t("disciplinesLabel")}</p>
                {loadingClassTypes ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted" />
                ) : null}
              </div>
              <p className="mb-2 text-xs text-muted">
                {t("noSelectionAllDisciplines")}
              </p>
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-input-border/60 bg-surface/50 p-3">
                {classTypes.length === 0 && !loadingClassTypes ? (
                  <p className="text-sm text-muted">{t("noDisciplinesInStudio")}</p>
                ) : (
                  classTypes.map((ct) => (
                    <label
                      key={ct.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input-border accent-admin"
                        checked={form.classTypeIds.includes(ct.id)}
                        onChange={() => toggleClassType(ct.id)}
                      />
                      <span>{ct.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            )}

            {/* Guest configuration */}
            {form.type !== "ON_DEMAND_SUBSCRIPTION" && (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input-border accent-admin"
                  checked={form.allowGuests}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, allowGuests: e.target.checked }))
                  }
                />
                <span className="font-medium">Permitir invitados en reservas</span>
              </label>

              {form.allowGuests && (
                <div className="space-y-3 rounded-xl border border-input-border/60 bg-surface/50 p-3">
                  <p className="text-xs text-muted">
                    Los usuarios con este paquete podrán agregar invitados a sus reservas. Cada invitado consume un crédito adicional.
                  </p>
                  <div>
                    <label className="mb-1 block text-xs font-medium" htmlFor="pkg-max-guests">
                      Máx. invitados por reserva (opcional)
                    </label>
                    <Input
                      id="pkg-max-guests"
                      type="number"
                      min={1}
                      max={10}
                      value={form.maxGuestsPerBooking}
                      onChange={(e) => setForm((f) => ({ ...f, maxGuestsPerBooking: e.target.value }))}
                      placeholder="Sin límite"
                      className="w-40"
                    />
                  </div>
                  {form.creditsUnlimited && (
                    <div>
                      <label className="mb-1 block text-xs font-medium" htmlFor="pkg-monthly-guests">
                        Pases de invitado al mes (para pases ilimitados)
                      </label>
                      <Input
                        id="pkg-monthly-guests"
                        type="number"
                        min={0}
                        value={form.monthlyGuestPasses}
                        onChange={(e) => setForm((f) => ({ ...f, monthlyGuestPasses: e.target.value }))}
                        placeholder="Sin límite"
                        className="w-40"
                      />
                      <p className="mt-1 text-xs text-muted">
                        Controla cuántos pases de invitado se incluyen mensualmente con paquetes ilimitados.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-country">
                {t("countryOptional")}
              </label>
              <div className="rounded-md border border-input-border bg-background shadow-sm">
                <select
                  id="pkg-country"
                  disabled={loadingCountries}
                  value={form.countryId}
                  onChange={(e) => setForm((f) => ({ ...f, countryId: e.target.value }))}
                  className={cn(
                    "flex h-11 w-full appearance-none rounded-md bg-transparent px-3 py-2 text-base font-body text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  <option value="">{t("noGeoRestriction")}</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {formError ? (
              <p className="text-sm text-red-600" role="alert">
                {formError}
              </p>
            ) : null}

            <Separator />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeDialog}>
                {tc("cancel")}
              </Button>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={saveMutation.isPending}
                className="gap-2 bg-admin hover:bg-admin/90"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? tc("save") : tc("create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
