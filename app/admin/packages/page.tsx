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

interface PackageData {
  id: string;
  name: string;
  description: string | null;
  type: "OFFER" | "PACK" | "SUBSCRIPTION";
  credits: number | null;
  validDays: number;
  price: number;
  currency: string;
  isPromo: boolean;
  isActive: boolean;
  classTypes: { id: string; name: string }[];
  recurringInterval: string | null;
  sortOrder: number;
  countryId: string | null;
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

const TAB_CONFIG: { type: PackageKind; label: string; icon: typeof Gift }[] = [
  { type: "OFFER", label: "Ofertas", icon: Gift },
  { type: "PACK", label: "Paquetes", icon: Layers },
  { type: "SUBSCRIPTION", label: "Suscripciones", icon: CalendarSync },
];

const CURRENCIES = ["EUR", "MXN", "USD"] as const;

const RECURRING_OPTIONS = [
  { value: "month", label: "Mensual" },
  { value: "year", label: "Anual" },
] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

function formatRecurringLabel(interval: string | null): string {
  if (!interval) return "—";
  const lower = interval.toLowerCase();
  if (lower === "month" || lower === "monthly") return "Mensual";
  if (lower === "year" || lower === "annual" || lower === "yearly") return "Anual";
  return interval;
}

function classTypesLabel(pkg: PackageData): string {
  if (!pkg.classTypes?.length) return "Todas las disciplinas";
  return pkg.classTypes.map((c) => c.name).join(", ");
}

interface FormState {
  type: PackageKind;
  name: string;
  description: string;
  price: string;
  currency: string;
  creditsUnlimited: boolean;
  credits: string;
  validDays: string;
  recurringInterval: string;
  classTypeIds: string[];
  countryId: string;
  sortOrder: string;
}

function emptyForm(forType: PackageKind): FormState {
  return {
    type: forType,
    name: "",
    description: "",
    price: "",
    currency: "EUR",
    creditsUnlimited: false,
    credits: "",
    validDays: "30",
    recurringInterval: "month",
    classTypeIds: [],
    countryId: "",
    sortOrder: "0",
  };
}

function formFromPackage(pkg: PackageData): FormState {
  return {
    type: pkg.type,
    name: pkg.name,
    description: pkg.description ?? "",
    price: String(pkg.price),
    currency: pkg.currency || "EUR",
    creditsUnlimited: pkg.credits === null,
    credits: pkg.credits === null ? "" : String(pkg.credits),
    validDays: String(pkg.validDays),
    recurringInterval:
      pkg.recurringInterval === "year" || pkg.recurringInterval === "annual"
        ? "year"
        : "month",
    classTypeIds: pkg.classTypes?.map((c) => c.id) ?? [],
    countryId: pkg.countryId ?? "",
    sortOrder: String(pkg.sortOrder ?? 0),
  };
}

function buildPayload(form: FormState) {
  const price = parseFloat(form.price);
  const validDays = parseInt(form.validDays, 10);
  const sortOrder = parseInt(form.sortOrder, 10) || 0;
  const credits =
    form.creditsUnlimited
      ? null
      : form.credits.trim() === ""
        ? null
        : parseInt(form.credits, 10);

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    type: form.type,
    price,
    currency: form.currency,
    credits,
    validDays,
    recurringInterval:
      form.type === "SUBSCRIPTION" ? form.recurringInterval : null,
    classTypeIds: form.classTypeIds,
    countryId: form.countryId.trim() === "" ? null : form.countryId,
    sortOrder,
  };
}

export default function AdminPackagesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PackageKind>("OFFER");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm("OFFER"));
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
        throw new Error(err.error || "No se pudo actualizar");
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
        throw new Error(err.error || "No se pudo guardar");
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
    setForm(emptyForm(activeTab));
    setFormError(null);
  }, [activeTab]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(activeTab));
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (pkg: PackageData) => {
    setEditingId(pkg.id);
    setForm(formFromPackage(pkg));
    setFormError(null);
    setDialogOpen(true);
  };

  const onSubmit = () => {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    const price = parseFloat(form.price);
    if (Number.isNaN(price) || price < 0) {
      setFormError("Indica un precio válido.");
      return;
    }
    const validDays = parseInt(form.validDays, 10);
    if (Number.isNaN(validDays) || validDays < 1) {
      setFormError("Los días de validez deben ser al menos 1.");
      return;
    }
    if (form.type === "SUBSCRIPTION" && !form.recurringInterval) {
      setFormError("Selecciona la periodicidad de la suscripción.");
      return;
    }
    if (!form.creditsUnlimited) {
      if (form.credits.trim() === "") {
        setFormError("Indica un número de créditos o marca ilimitado.");
        return;
      }
      const c = parseInt(form.credits, 10);
      if (Number.isNaN(c) || c < 0) {
        setFormError("Los créditos deben ser un número válido.");
        return;
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

  const tabMeta = TAB_CONFIG.find((t) => t.type === activeTab)!;
  const TabIcon = tabMeta.icon;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Paquetes y precios</h1>
          <p className="mt-1 text-muted">
            Ofertas de entrada, paquetes de créditos y suscripciones recurrentes
          </p>
        </motion.div>

        <Button onClick={openCreate} className="gap-2 bg-admin hover:bg-admin/90">
          <Plus className="h-4 w-4" />
          Nuevo
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
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              <span className="truncate">{tab.label}</span>
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
              No hay {tabMeta.label.toLowerCase()} en este momento
            </p>
            <Button
              size="sm"
              className="gap-2 bg-admin hover:bg-admin/90"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              Crear uno
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
                        {pkg.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                      {pkg.isPromo ? (
                        <Badge variant="outline" className="border-admin/30 text-admin">
                          Promo
                        </Badge>
                      ) : null}
                    </div>
                    {pkg.description ? (
                      <p className="text-sm text-muted">{pkg.description}</p>
                    ) : null}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      <span>
                        Precio:{" "}
                        <strong className="font-mono text-foreground">
                          {formatCurrency(pkg.price, pkg.currency)}
                        </strong>
                      </span>
                      <span>
                        Créditos:{" "}
                        <strong className="font-mono text-foreground">
                          {pkg.credits === null ? "Ilimitados" : pkg.credits}
                        </strong>
                      </span>
                      <span>
                        Validez:{" "}
                        <strong className="font-mono text-foreground">
                          {pkg.validDays} días
                        </strong>
                      </span>
                      {pkg.type === "SUBSCRIPTION" ? (
                        <span>
                          Periodicidad:{" "}
                          <strong className="text-foreground">
                            {formatRecurringLabel(pkg.recurringInterval)}
                          </strong>
                        </span>
                      ) : null}
                    </div>

                    <p className="text-xs leading-relaxed text-muted">
                      <span className="font-medium text-foreground/80">Disciplinas: </span>
                      {classTypesLabel(pkg)}
                    </p>
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
                      {pkg.isActive ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => openEdit(pkg)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
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
            <DialogTitle>{editingId ? "Editar paquete" : "Nuevo paquete"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Actualiza precios, validez, disciplinas y visibilidad."
                : "Define tipo, precio y reglas de uso. Sin disciplinas marcadas = todas."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            <div>
              <p className="mb-2 text-sm font-medium">Tipo</p>
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
                          tab.type === "SUBSCRIPTION" ? f.recurringInterval || "month" : "month",
                      }))
                    }
                    className={cn(
                      "flex-1 rounded-lg py-2 text-xs font-medium transition-all sm:text-[13px]",
                      form.type === tab.type
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted hover:text-foreground",
                      editingId && "cursor-not-allowed opacity-60",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {editingId ? (
                <p className="mt-1.5 text-xs text-muted">El tipo no se puede cambiar al editar.</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-name">
                Nombre
              </label>
              <Input
                id="pkg-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej. Primera clase"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-desc">
                Descripción
              </label>
              <Textarea
                id="pkg-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Texto breve para clientes…"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-price">
                  Precio
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
                  Moneda
                </label>
                <Input
                  id="pkg-currency"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  list="pkg-currency-options"
                  placeholder="MXN"
                />
                <datalist id="pkg-currency-options">
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-credits">
                  Créditos
                </label>
                <Input
                  id="pkg-credits"
                  type="number"
                  min={0}
                  disabled={form.creditsUnlimited}
                  value={form.credits}
                  onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
                  placeholder="Número de clases"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input-border accent-admin"
                  checked={form.creditsUnlimited}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, creditsUnlimited: e.target.checked }))
                  }
                />
                Ilimitado
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-days">
                  Días de validez
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
                  Orden
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

            {form.type === "SUBSCRIPTION" ? (
              <div>
                <p className="mb-2 text-sm font-medium">Periodicidad</p>
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
                          ? "bg-white text-foreground shadow-sm"
                          : "text-muted hover:text-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Disciplinas</p>
                {loadingClassTypes ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted" />
                ) : null}
              </div>
              <p className="mb-2 text-xs text-muted">
                Sin selección = todas las disciplinas. Marca solo si quieres restringir.
              </p>
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-input-border/60 bg-surface/50 p-3">
                {classTypes.length === 0 && !loadingClassTypes ? (
                  <p className="text-sm text-muted">No hay disciplinas en el estudio.</p>
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

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="pkg-country">
                País (opcional)
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
                  <option value="">Sin restricción geográfica</option>
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
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={saveMutation.isPending}
                className="gap-2 bg-admin hover:bg-admin/90"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
