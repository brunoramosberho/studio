"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Ticket,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Percent,
  DollarSign,
  Copy,
  Check,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency, cn } from "@/lib/utils";
import { useCurrency } from "@/components/tenant-provider";
import { useTranslations } from "next-intl";

interface DiscountData {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  currency: string | null;
  maxUses: number | null;
  usedCount: number;
  maxUsesPerUser: number | null;
  minPurchase: number | null;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  packageIds: string[];
  stripeCouponId: string | null;
  createdAt: string;
  _count: { redemptions: number };
}

interface PackageOption {
  id: string;
  name: string;
  price: number;
  currency: string;
}

interface FormState {
  code: string;
  description: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: string;
  currency: string;
  maxUses: string;
  maxUsesPerUser: string;
  minPurchase: string;
  validFrom: string;
  validUntil: string;
  packageIds: string[];
}

function emptyForm(defaultCurrency = "EUR"): FormState {
  return {
    code: "",
    description: "",
    type: "PERCENTAGE",
    value: "",
    currency: defaultCurrency,
    maxUses: "",
    maxUsesPerUser: "",
    minPurchase: "",
    validFrom: "",
    validUntil: "",
    packageIds: [],
  };
}

function formFromDiscount(d: DiscountData, defaultCurrency = "EUR"): FormState {
  return {
    code: d.code,
    description: d.description || "",
    type: d.type,
    value: String(d.value),
    currency: d.currency || defaultCurrency,
    maxUses: d.maxUses !== null ? String(d.maxUses) : "",
    maxUsesPerUser: d.maxUsesPerUser !== null ? String(d.maxUsesPerUser) : "",
    minPurchase: d.minPurchase !== null ? String(d.minPurchase) : "",
    validFrom: d.validFrom ? d.validFrom.slice(0, 16) : "",
    validUntil: d.validUntil ? d.validUntil.slice(0, 16) : "",
    packageIds: d.packageIds || [],
  };
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function DiscountsPage() {
  const t = useTranslations("discounts");
  const ta = useTranslations("admin");
  const qc = useQueryClient();
  const tenantCurrency = useCurrency();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountData | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(tenantCurrency.code));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: discounts, isLoading } = useQuery<DiscountData[]>({
    queryKey: ["admin-discounts"],
    queryFn: () => fetch("/api/admin/discounts").then((r) => r.json()),
  });

  const { data: packages } = useQuery<PackageOption[]>({
    queryKey: ["admin-packages-list"],
    queryFn: () =>
      fetch("/api/packages?all=true")
        .then((r) => r.json())
        .then((pkgs: PackageOption[]) =>
          pkgs.filter((p: PackageOption & { isActive?: boolean }) => (p as PackageOption & { isActive: boolean }).isActive !== false),
        ),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const url = editing
        ? `/api/admin/discounts/${editing.id}`
        : "/api/admin/discounts";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-discounts"] });
      closeDialog();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/admin/discounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-discounts"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/discounts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-discounts"] }),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(tenantCurrency.code));
    setDialogOpen(true);
  }

  function openEdit(d: DiscountData) {
    setEditing(d);
    setForm(formFromDiscount(d, tenantCurrency.code));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm(tenantCurrency.code));
  }

  function handleSave() {
    const payload: Record<string, unknown> = {
      code: form.code.trim(),
      description: form.description || null,
      type: form.type,
      value: parseFloat(form.value),
      currency: form.type === "FIXED_AMOUNT" ? form.currency : null,
      maxUses: form.maxUses ? parseInt(form.maxUses, 10) : null,
      maxUsesPerUser: form.maxUsesPerUser
        ? parseInt(form.maxUsesPerUser, 10)
        : null,
      minPurchase: form.minPurchase ? parseFloat(form.minPurchase) : null,
      validFrom: form.validFrom || null,
      validUntil: form.validUntil || null,
      packageIds: form.packageIds,
    };
    saveMutation.mutate(payload);
  }

  function copyCode(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const isFormValid =
    form.code.trim() &&
    form.value &&
    !isNaN(parseFloat(form.value)) &&
    parseFloat(form.value) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Ticket className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          {t("create")}
        </Button>
      </div>

      {/* Stats summary */}
      {discounts && discounts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{discounts.length}</div>
              <div className="text-xs text-muted-foreground">{t("totalCodes")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">
                {discounts.filter((d) => d.isActive).length}
              </div>
              <div className="text-xs text-muted-foreground">{t("activeCodes")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">
                {discounts.reduce((sum, d) => sum + d._count.redemptions, 0)}
              </div>
              <div className="text-xs text-muted-foreground">{t("totalRedemptions")}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!discounts || discounts.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Ticket className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold">{t("emptyTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("emptyDescription")}
            </p>
            <Button onClick={openCreate} className="mt-4 gap-2" size="sm">
              <Plus className="h-4 w-4" />
              {t("createFirst")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Discount codes list */}
      {discounts && discounts.length > 0 && (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-3"
        >
          {discounts.map((d) => (
            <motion.div key={d.id} variants={fadeUp}>
              <Card
                className={cn(
                  "transition-opacity",
                  !d.isActive && "opacity-50",
                )}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        d.type === "PERCENTAGE"
                          ? "bg-blue-100 text-blue-600"
                          : "bg-green-100 text-green-600",
                      )}
                    >
                      {d.type === "PERCENTAGE" ? (
                        <Percent className="h-5 w-5" />
                      ) : (
                        <DollarSign className="h-5 w-5" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-bold">
                          {d.code}
                        </span>
                        <button
                          onClick={() => copyCode(d.code, d.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {copiedId === d.id ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {!d.isActive && (
                          <Badge variant="secondary">{t("inactive")}</Badge>
                        )}
                        {d.stripeCouponId && (
                          <Badge
                            variant="outline"
                            className="text-xs text-purple-600"
                          >
                            Stripe
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>
                          {d.type === "PERCENTAGE"
                            ? `${d.value}% ${t("off")}`
                            : `${formatCurrency(d.value, d.currency || tenantCurrency.code)} ${t("off")}`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {d._count.redemptions}
                          {d.maxUses ? `/${d.maxUses}` : ""} {t("uses")}
                        </span>
                        {d.validUntil && (
                          <span>
                            {t("until")}{" "}
                            {new Date(d.validUntil).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {d.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {d.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        toggleMutation.mutate({
                          id: d.id,
                          isActive: !d.isActive,
                        })
                      }
                    >
                      {d.isActive ? (
                        <ToggleRight className="h-5 w-5 text-green-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(d)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(t("deleteConfirm"))) {
                          deleteMutation.mutate(d.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("editTitle") : t("createTitle")}
            </DialogTitle>
            <DialogDescription>
              {editing ? t("editDescription") : t("createDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Code */}
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("codeLabel")}
              </label>
              <Input
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="WELCOME20"
                disabled={!!editing}
                className="font-mono"
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("descriptionLabel")}
              </label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder={t("descriptionPlaceholder")}
                rows={2}
              />
            </div>

            {/* Type */}
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("typeLabel")}
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={
                    form.type === "PERCENTAGE" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, type: "PERCENTAGE" }))}
                  className="flex-1 gap-2"
                >
                  <Percent className="h-4 w-4" />
                  {t("percentage")}
                </Button>
                <Button
                  type="button"
                  variant={
                    form.type === "FIXED_AMOUNT" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({ ...f, type: "FIXED_AMOUNT" }))
                  }
                  className="flex-1 gap-2"
                >
                  <DollarSign className="h-4 w-4" />
                  {t("fixedAmount")}
                </Button>
              </div>
            </div>

            {/* Value + Currency */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium">
                  {form.type === "PERCENTAGE"
                    ? t("percentageValue")
                    : t("amountValue")}
                </label>
                <Input
                  type="number"
                  min={0}
                  max={form.type === "PERCENTAGE" ? 100 : undefined}
                  step={form.type === "PERCENTAGE" ? 1 : 0.01}
                  value={form.value}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, value: e.target.value }))
                  }
                  placeholder={
                    form.type === "PERCENTAGE" ? "20" : "50.00"
                  }
                />
              </div>
              {form.type === "FIXED_AMOUNT" && (
                <div className="w-24">
                  <label className="mb-1 block text-sm font-medium">
                    {t("currencyLabel")}
                  </label>
                  <select
                    value={form.currency}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, currency: e.target.value }))
                    }
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="EUR">EUR</option>
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              )}
            </div>

            {/* Limits */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t("maxUsesLabel")}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={form.maxUses}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxUses: e.target.value }))
                  }
                  placeholder={t("unlimited")}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t("maxUsesPerUserLabel")}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={form.maxUsesPerUser}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      maxUsesPerUser: e.target.value,
                    }))
                  }
                  placeholder={t("unlimited")}
                />
              </div>
            </div>

            {/* Min purchase */}
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("minPurchaseLabel")}
              </label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.minPurchase}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minPurchase: e.target.value }))
                }
                placeholder={t("noMinimum")}
              />
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t("validFromLabel")}
                </label>
                <Input
                  type="datetime-local"
                  value={form.validFrom}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, validFrom: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t("validUntilLabel")}
                </label>
                <Input
                  type="datetime-local"
                  value={form.validUntil}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, validUntil: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Package restrictions */}
            {packages && packages.length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t("packageRestrictions")}
                </label>
                <p className="mb-2 text-xs text-muted-foreground">
                  {t("packageRestrictionsHint")}
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {packages.map((pkg) => (
                    <label
                      key={pkg.id}
                      className="flex items-center gap-2 rounded p-1 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={form.packageIds.includes(pkg.id)}
                        onChange={(e) => {
                          setForm((f) => ({
                            ...f,
                            packageIds: e.target.checked
                              ? [...f.packageIds, pkg.id]
                              : f.packageIds.filter((id) => id !== pkg.id),
                          }));
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">
                        {pkg.name} — {formatCurrency(pkg.price, pkg.currency)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Save button */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeDialog}>
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={!isFormValid || saveMutation.isPending}
              >
                {saveMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editing ? t("save") : t("create")}
              </Button>
            </div>

            {saveMutation.isError && (
              <p className="text-sm text-destructive">
                {(saveMutation.error as Error).message}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
