"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Plus,
  Loader2,
  Trash2,
  Edit3,
  Pencil,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";

interface StaffDetail {
  membership: {
    id: string;
    role: string;
    user: { id: string; name: string | null; email: string; phone: string | null; image: string | null };
  };
  payRates: PayRate[];
  commissionRules: CommissionRule[];
  activeShift: Shift | null;
}

interface PayRate {
  id: string;
  studioId: string | null;
  studio: { id: string; name: string } | null;
  hourlyRateCents: number | null;
  monthlyFixedCents: number | null;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
}

interface CommissionRule {
  id: string;
  studioId: string | null;
  studio: { id: string; name: string } | null;
  sourceType: "POS_ANY" | "PACKAGE" | "PRODUCT" | "SUBSCRIPTION" | "PENALTY";
  packageId: string | null;
  package: { id: string; name: string } | null;
  productId: string | null;
  product: { id: string; name: string } | null;
  percentBps: number | null;
  flatAmountCents: number | null;
  isActive: boolean;
  notes: string | null;
}

interface Shift {
  id: string;
  status: "OPEN" | "CLOSED" | "AUTO_CLOSED" | "EDITED" | "VOIDED";
  clockInAt: string;
  clockOutAt: string | null;
  durationMinutes: number | null;
  studio: { id: string; name: string };
  editedBy: { id: string; name: string | null } | null;
  editReason: string | null;
  clockInDistance: number | null;
  notes: string | null;
}

interface PayrollLine {
  totalHours: number;
  hourlyByStudio: Array<{ studioId: string; studioName: string; hours: number; rateCents: number | null; earnedCents: number }>;
  hourlyTotalCents: number;
  monthlyFixedCents: number;
  monthlyFixedByStudio: Array<{ studioId: string | null; studioName: string | null; amountCents: number }>;
  commissionTotalCents: number;
  commissionByStudio: Array<{ studioId: string | null; studioName: string | null; amountCents: number; count: number }>;
  totalCents: number;
  currency: string;
}

interface Studio {
  id: string;
  name: string;
}

interface Package {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
}

function formatCents(cents: number | null | undefined, currency: string) {
  if (cents == null) return "—";
  return formatCurrency(cents / 100, currency);
}

function formatPercent(bps: number | null) {
  if (bps == null) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}

function sourceLabel(s: CommissionRule["sourceType"]) {
  return {
    POS_ANY: "Cualquier venta POS",
    PACKAGE: "Paquetes",
    PRODUCT: "Productos",
    SUBSCRIPTION: "Suscripciones",
    PENALTY: "Penalizaciones",
  }[s];
}

export default function StaffDetailPage({
  params,
}: {
  params: Promise<{ membershipId: string }>;
}) {
  const { membershipId } = use(params);
  const [tab, setTab] = useState<"pay" | "commissions" | "timesheet" | "payroll">("pay");

  const detailQuery = useQuery<StaffDetail>({
    queryKey: ["staff", "detail", membershipId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/staff/${membershipId}`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const studiosQuery = useQuery<{ studios: Studio[] }>({
    queryKey: ["staff", "studios"],
    queryFn: async () => {
      const res = await fetch("/api/admin/staff/me/active-shift");
      if (!res.ok) return { studios: [] };
      const json = await res.json();
      return { studios: json.studios ?? [] };
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }
  if (!detailQuery.data) return null;
  const detail = detailQuery.data;
  const studios = studiosQuery.data?.studios ?? [];
  const user = detail.membership.user;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <Link
          href="/admin/staff"
          className="rounded-md border border-border bg-card p-2 hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {user.name ?? user.email}
          </h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          {detail.activeShift && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
              <Clock className="h-3 w-3" /> En turno en {detail.activeShift.studio.name}
            </div>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pay">Sueldo</TabsTrigger>
          <TabsTrigger value="commissions">Comisiones</TabsTrigger>
          <TabsTrigger value="timesheet">Timesheet</TabsTrigger>
          <TabsTrigger value="payroll">Nómina</TabsTrigger>
        </TabsList>

        <TabsContent value="pay">
          <PayRatesTab
            membershipId={membershipId}
            rates={detail.payRates}
            studios={studios}
          />
        </TabsContent>
        <TabsContent value="commissions">
          <CommissionRulesTab
            membershipId={membershipId}
            rules={detail.commissionRules}
            studios={studios}
          />
        </TabsContent>
        <TabsContent value="timesheet">
          <TimesheetTab membershipId={membershipId} studios={studios} />
        </TabsContent>
        <TabsContent value="payroll">
          <PayrollTab membershipId={membershipId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pay Rates tab
// ─────────────────────────────────────────────────────────────────────────────

function PayRatesTab({
  membershipId,
  rates,
  studios,
}: {
  membershipId: string;
  rates: PayRate[];
  studios: Studio[];
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PayRate | null>(null);

  const create = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(
        `/api/admin/staff/${membershipId}/pay-rates`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff", "detail", membershipId] });
      setShowForm(false);
      setEditing(null);
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/admin/staff/pay-rates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff", "detail", membershipId] });
      setEditing(null);
      setShowForm(false);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/staff/pay-rates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["staff", "detail", membershipId] }),
  });

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define tarifa por hora o monto fijo mensual. Distinto por estudio si quieres.
        </p>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Nuevo
        </Button>
      </div>

      {showForm && (
        <PayRateForm
          studios={studios}
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSubmit={(data) => {
            if (editing) update.mutate({ id: editing.id, data });
            else create.mutate(data);
          }}
          submitting={create.isPending || update.isPending}
        />
      )}

      <Card>
        <CardContent className="p-0">
          {rates.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No hay tarifas configuradas.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rates.map((r) => (
                <li key={r.id} className="flex items-center gap-3 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {r.studio?.name ?? "Todos los estudios"}
                      </span>
                      {!r.isActive && <Badge variant="outline">Inactiva</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.hourlyRateCents != null && (
                        <span>
                          {formatCents(r.hourlyRateCents, r.currency)} / hora
                        </span>
                      )}
                      {r.hourlyRateCents != null && r.monthlyFixedCents != null && (
                        <span> · </span>
                      )}
                      {r.monthlyFixedCents != null && (
                        <span>{formatCents(r.monthlyFixedCents, r.currency)} fijo mensual</span>
                      )}
                      {" · desde "}
                      {new Date(r.effectiveFrom).toLocaleDateString()}
                      {r.effectiveTo && ` hasta ${new Date(r.effectiveTo).toLocaleDateString()}`}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setShowForm(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("¿Eliminar tarifa?")) remove.mutate(r.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PayRateForm({
  studios,
  initial,
  onCancel,
  onSubmit,
  submitting,
}: {
  studios: Studio[];
  initial: PayRate | null;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [studioId, setStudioId] = useState(initial?.studioId ?? "");
  const [hourly, setHourly] = useState(
    initial?.hourlyRateCents != null ? (initial.hourlyRateCents / 100).toString() : "",
  );
  const [monthly, setMonthly] = useState(
    initial?.monthlyFixedCents != null ? (initial.monthlyFixedCents / 100).toString() : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(
    initial?.effectiveFrom ? initial.effectiveFrom.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Estudio</Label>
            <Select value={studioId || "all"} onValueChange={(v) => setStudioId(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Todos los estudios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estudios (default)</SelectItem>
                {studios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vigente desde</Label>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Tarifa por hora (MXN)</Label>
            <Input
              type="number"
              step="1"
              min="0"
              placeholder="0"
              value={hourly}
              onChange={(e) => setHourly(e.target.value)}
            />
          </div>
          <div>
            <Label>Fijo mensual (MXN)</Label>
            <Input
              type="number"
              step="1"
              min="0"
              placeholder="0"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Notas</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="rate-active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <Label htmlFor="rate-active">Activa</Label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button
            onClick={() =>
              onSubmit({
                studioId: studioId || null,
                hourlyRateCents: hourly ? Math.round(parseFloat(hourly) * 100) : null,
                monthlyFixedCents: monthly ? Math.round(parseFloat(monthly) * 100) : null,
                effectiveFrom: new Date(effectiveFrom).toISOString(),
                isActive,
                notes,
              })
            }
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission Rules tab
// ─────────────────────────────────────────────────────────────────────────────

function CommissionRulesTab({
  membershipId,
  rules,
  studios,
}: {
  membershipId: string;
  rules: CommissionRule[];
  studios: Studio[];
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CommissionRule | null>(null);

  const packagesQuery = useQuery<{ packages: Package[] }>({
    queryKey: ["staff", "packages"],
    queryFn: async () => {
      const res = await fetch("/api/admin/packages?simple=1");
      if (!res.ok) return { packages: [] };
      const json = await res.json();
      return { packages: (Array.isArray(json) ? json : json.packages ?? []) as Package[] };
    },
  });
  const productsQuery = useQuery<{ products: Product[] }>({
    queryKey: ["staff", "products"],
    queryFn: async () => {
      const res = await fetch("/api/admin/shop/products");
      if (!res.ok) return { products: [] };
      const json = await res.json();
      return { products: (Array.isArray(json) ? json : json.products ?? []) as Product[] };
    },
  });

  const create = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/staff/${membershipId}/commission-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff", "detail", membershipId] });
      setShowForm(false);
      setEditing(null);
    },
  });
  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/admin/staff/commission-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff", "detail", membershipId] });
      setEditing(null);
      setShowForm(false);
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/staff/commission-rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["staff", "detail", membershipId] }),
  });

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Comisiones por paquetes, productos, suscripciones o cualquier venta POS.
        </p>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Nueva
        </Button>
      </div>

      {showForm && (
        <CommissionRuleForm
          studios={studios}
          packages={packagesQuery.data?.packages ?? []}
          products={productsQuery.data?.products ?? []}
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSubmit={(data) => {
            if (editing) update.mutate({ id: editing.id, data });
            else create.mutate(data);
          }}
          submitting={create.isPending || update.isPending}
        />
      )}

      <Card>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sin reglas de comisión.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{sourceLabel(r.sourceType)}</Badge>
                      {r.package && <Badge variant="outline">{r.package.name}</Badge>}
                      {r.product && <Badge variant="outline">{r.product.name}</Badge>}
                      {r.studio && <Badge variant="outline">{r.studio.name}</Badge>}
                      {!r.isActive && <Badge variant="outline">Inactiva</Badge>}
                    </div>
                    <div className="mt-1 text-sm">
                      {r.percentBps != null && <span>{formatPercent(r.percentBps)}</span>}
                      {r.flatAmountCents != null && (
                        <span>{formatCents(r.flatAmountCents, "MXN")} fijo</span>
                      )}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setShowForm(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("¿Eliminar regla?")) remove.mutate(r.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CommissionRuleForm({
  studios,
  packages,
  products,
  initial,
  onCancel,
  onSubmit,
  submitting,
}: {
  studios: Studio[];
  packages: Package[];
  products: Product[];
  initial: CommissionRule | null;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [sourceType, setSourceType] = useState<CommissionRule["sourceType"]>(initial?.sourceType ?? "PACKAGE");
  const [studioId, setStudioId] = useState(initial?.studioId ?? "");
  const [packageId, setPackageId] = useState(initial?.packageId ?? "");
  const [productId, setProductId] = useState(initial?.productId ?? "");
  const [percent, setPercent] = useState(
    initial?.percentBps != null ? (initial.percentBps / 100).toString() : "",
  );
  const [flat, setFlat] = useState(
    initial?.flatAmountCents != null ? (initial.flatAmountCents / 100).toString() : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [mode, setMode] = useState<"percent" | "flat">(
    initial?.flatAmountCents != null ? "flat" : "percent",
  );

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Tipo de venta</Label>
            <Select value={sourceType} onValueChange={(v) => setSourceType(v as typeof sourceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POS_ANY">Cualquier venta POS</SelectItem>
                <SelectItem value="PACKAGE">Paquetes</SelectItem>
                <SelectItem value="PRODUCT">Productos</SelectItem>
                <SelectItem value="SUBSCRIPTION">Suscripciones</SelectItem>
                <SelectItem value="PENALTY">Penalizaciones</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estudio</Label>
            <Select value={studioId || "all"} onValueChange={(v) => setStudioId(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {studios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {sourceType === "PACKAGE" && (
          <div>
            <Label>Paquete (opcional)</Label>
            <Select value={packageId || "any"} onValueChange={(v) => setPackageId(v === "any" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Cualquier paquete" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Cualquier paquete</SelectItem>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {sourceType === "PRODUCT" && (
          <div>
            <Label>Producto (opcional)</Label>
            <Select value={productId || "any"} onValueChange={(v) => setProductId(v === "any" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Cualquier producto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Cualquier producto</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-3 rounded-md bg-muted p-1">
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 text-sm ${mode === "percent" ? "bg-background shadow" : ""}`}
            onClick={() => setMode("percent")}
          >
            Porcentaje
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 text-sm ${mode === "flat" ? "bg-background shadow" : ""}`}
            onClick={() => setMode("flat")}
          >
            Monto fijo
          </button>
        </div>
        {mode === "percent" ? (
          <div>
            <Label>Porcentaje (%)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="5"
            />
          </div>
        ) : (
          <div>
            <Label>Monto fijo por venta (MXN)</Label>
            <Input
              type="number"
              step="1"
              min="0"
              value={flat}
              onChange={(e) => setFlat(e.target.value)}
              placeholder="50"
            />
          </div>
        )}

        <div>
          <Label>Notas</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button
            onClick={() =>
              onSubmit({
                sourceType,
                studioId: studioId || null,
                packageId: sourceType === "PACKAGE" ? (packageId || null) : null,
                productId: sourceType === "PRODUCT" ? (productId || null) : null,
                percentBps: mode === "percent" && percent
                  ? Math.round(parseFloat(percent) * 100)
                  : null,
                flatAmountCents: mode === "flat" && flat
                  ? Math.round(parseFloat(flat) * 100)
                  : null,
                notes,
              })
            }
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Timesheet tab
// ─────────────────────────────────────────────────────────────────────────────

function TimesheetTab({
  membershipId,
  studios,
}: {
  membershipId: string;
  studios: Studio[];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Shift | null>(null);

  const tsQuery = useQuery<{ shifts: Shift[] }>({
    queryKey: ["staff", "timesheet", membershipId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/staff/${membershipId}/timesheet`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const voidShift = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(
        `/api/admin/staff/shifts/${id}?reason=${encodeURIComponent(reason)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["staff", "timesheet", membershipId] }),
  });

  const editShift = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/admin/staff/shifts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff", "timesheet", membershipId] });
      setEditing(null);
    },
  });

  const shifts = tsQuery.data?.shifts ?? [];

  return (
    <div className="mt-4 space-y-4">
      {editing && (
        <ShiftEditForm
          shift={editing}
          studios={studios}
          onCancel={() => setEditing(null)}
          onSubmit={(data) => editShift.mutate({ id: editing.id, data })}
          submitting={editShift.isPending}
        />
      )}
      <Card>
        <CardContent className="p-0">
          {tsQuery.isLoading ? (
            <div className="p-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
          ) : shifts.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Sin turnos.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Entrada</th>
                  <th className="px-3 py-2 text-left">Salida</th>
                  <th className="px-3 py-2 text-left">Duración</th>
                  <th className="px-3 py-2 text-left">Estudio</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      {new Date(s.clockInAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s.clockOutAt ? new Date(s.clockOutAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {s.durationMinutes != null
                        ? `${Math.floor(s.durationMinutes / 60)}h ${s.durationMinutes % 60}m`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">{s.studio.name}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          s.status === "OPEN" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : s.status === "VOIDED" ? "border-red-500/40 text-red-700 dark:text-red-300"
                          : s.status === "AUTO_CLOSED" ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                          : ""
                        }
                      >
                        {s.status}
                      </Badge>
                      {s.editedBy && (
                        <div className="text-[10px] text-muted-foreground">
                          editado por {s.editedBy.name ?? "admin"}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(s)}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      {s.status !== "VOIDED" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            const reason = prompt("Razón para anular el turno:");
                            if (reason && reason.length >= 3) voidShift.mutate({ id: s.id, reason });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShiftEditForm({
  shift,
  studios,
  onCancel,
  onSubmit,
  submitting,
}: {
  shift: Shift;
  studios: Studio[];
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  function toLocal(iso: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
  }
  const [clockInAt, setClockInAt] = useState(toLocal(shift.clockInAt));
  const [clockOutAt, setClockOutAt] = useState(toLocal(shift.clockOutAt));
  const [studioId, setStudioId] = useState(shift.studio.id);
  const [reason, setReason] = useState("");

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Edit3 className="h-4 w-4" /> Editar turno
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Entrada</Label>
            <Input type="datetime-local" value={clockInAt} onChange={(e) => setClockInAt(e.target.value)} />
          </div>
          <div>
            <Label>Salida</Label>
            <Input type="datetime-local" value={clockOutAt} onChange={(e) => setClockOutAt(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Estudio</Label>
          <Select value={studioId} onValueChange={setStudioId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {studios.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Razón (requerida)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Olvidó checar salida, etc." />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button
            onClick={() =>
              onSubmit({
                clockInAt: new Date(clockInAt).toISOString(),
                clockOutAt: clockOutAt ? new Date(clockOutAt).toISOString() : null,
                studioId,
                reason,
              })
            }
            disabled={submitting || reason.length < 3}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payroll tab
// ─────────────────────────────────────────────────────────────────────────────

function PayrollTab({ membershipId }: { membershipId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const q = useQuery<{
    period: { from: string; to: string; label: string };
    line: PayrollLine | null;
    earnings: Array<{
      id: string;
      sourceType: string;
      commissionAmountCents: number;
      baseAmountCents: number;
      currency: string;
      percentBps: number | null;
      occurredAt: string;
      studio: { id: string; name: string } | null;
      posTransaction: { id: string; type: string; conceptSub: string | null; amount: number } | null;
      stripePayment: { id: string; type: string; conceptSub: string | null; amount: number } | null;
    }>;
  }>({
    queryKey: ["staff", "payroll", membershipId, year, month],
    queryFn: async () => {
      const res = await fetch(`/api/admin/staff/${membershipId}/payroll?year=${year}&month=${month}`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const line = q.data?.line ?? null;
  const earnings = q.data?.earnings ?? [];
  const currency = line?.currency ?? "MXN";

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-2">
        <Label>Periodo:</Label>
        <Input
          type="number"
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          className="w-24"
        />
        <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {new Date(2000, i, 1).toLocaleString("es-MX", { month: "long" })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading || !line ? (
        <Card><CardContent className="p-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Horas trabajadas</div>
              <div className="text-2xl font-semibold">{line.totalHours.toFixed(1)}h</div>
              <div className="text-xs text-muted-foreground">{formatCents(line.hourlyTotalCents, currency)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Fijo mensual</div>
              <div className="text-2xl font-semibold">{formatCents(line.monthlyFixedCents, currency)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Comisiones</div>
              <div className="text-2xl font-semibold">{formatCents(line.commissionTotalCents, currency)}</div>
              <div className="text-xs text-muted-foreground">{earnings.length} ventas</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Total a pagar</div>
              <div className="text-2xl font-semibold text-primary">{formatCents(line.totalCents, currency)}</div>
            </CardContent></Card>
          </div>

          {line.hourlyByStudio.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 text-sm font-medium">Horas por estudio</div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 text-left">Estudio</th>
                      <th className="py-1 text-right">Horas</th>
                      <th className="py-1 text-right">Tarifa</th>
                      <th className="py-1 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {line.hourlyByStudio.map((b) => (
                      <tr key={b.studioId} className="border-t border-border">
                        <td className="py-1">{b.studioName}</td>
                        <td className="py-1 text-right tabular-nums">{b.hours.toFixed(2)}</td>
                        <td className="py-1 text-right">{formatCents(b.rateCents, currency)}/h</td>
                        <td className="py-1 text-right">{formatCents(b.earnedCents, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {earnings.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 text-sm font-medium">Comisiones del mes</div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 text-left">Fecha</th>
                      <th className="py-1 text-left">Tipo</th>
                      <th className="py-1 text-left">Concepto</th>
                      <th className="py-1 text-right">Base</th>
                      <th className="py-1 text-right">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.map((e) => {
                      const sale = e.posTransaction ?? e.stripePayment;
                      return (
                        <tr key={e.id} className="border-t border-border">
                          <td className="py-1 text-xs">
                            {new Date(e.occurredAt).toLocaleDateString("es-MX")}
                          </td>
                          <td className="py-1"><Badge variant="outline">{e.sourceType}</Badge></td>
                          <td className="py-1 text-muted-foreground">{sale?.conceptSub ?? sale?.type ?? "—"}</td>
                          <td className="py-1 text-right">{formatCents(e.baseAmountCents, currency)}</td>
                          <td className="py-1 text-right font-medium">{formatCents(e.commissionAmountCents, currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
      {line && line.totalHours === 0 && earnings.length === 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          Sin actividad para este periodo.
        </div>
      )}
    </div>
  );
}
