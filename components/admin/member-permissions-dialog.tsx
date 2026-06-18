"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AdminPermission } from "@/lib/permissions";

export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "FRONT_DESK";
  permissions: AdminPermission[]; // effective
  permissionsOverride: AdminPermission[] | null; // null = role default
}

// Sections a studio can remove from an otherwise-full admin. These are the
// permissions enforced server-side (API or page gate), so toggling them off
// actually blocks access — not just hides the nav.
const REMOVABLE: { key: AdminPermission; label: string; hint: string }[] = [
  { key: "finance", label: "Finanzas", hint: "Ingresos, transacciones, reconocimiento" },
  { key: "billing", label: "Facturación y Stripe", hint: "Suscripción del estudio y Connect" },
  { key: "reports", label: "Reportes / Insights", hint: "Métricas de negocio" },
  { key: "analytics", label: "Analítica", hint: "GA4 / Meta Pixel" },
  { key: "marketing", label: "Marketing", hint: "Enlaces, highlights, adquisición" },
];

export function MemberPermissionsDialog({
  member,
  onClose,
}: {
  member: TeamMember | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const open = !!member;

  // Working set of granted permissions, seeded from the member's effective set.
  const [granted, setGranted] = useState<Set<AdminPermission>>(new Set());
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Re-seed when a different member opens.
  if (member && seededFor !== member.id) {
    setGranted(new Set(member.permissions));
    setSeededFor(member.id);
  }

  const dirty = useMemo(() => {
    if (!member) return false;
    const before = new Set(member.permissions);
    if (before.size !== granted.size) return true;
    for (const p of granted) if (!before.has(p)) return true;
    return false;
  }, [member, granted]);

  const save = useMutation({
    mutationFn: async (permissions: AdminPermission[] | null) => {
      const res = await fetch("/api/admin/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member!.id, permissions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-team"] });
      onClose();
    },
  });

  function toggle(key: AdminPermission) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-admin" />
            Permisos de {member?.name || member?.email}
          </DialogTitle>
          <DialogDescription>
            {member?.role === "ADMIN"
              ? "Quita secciones a este admin. Lo no marcado se bloquea de verdad (API y navegación)."
              : "Concede secciones extra a este miembro de front desk."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {REMOVABLE.map((p) => {
            const on = granted.has(p.key);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => toggle(p.key)}
                className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:bg-surface/50"
              >
                <span
                  className={
                    "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
                    (on ? "bg-admin" : "bg-border")
                  }
                >
                  <span
                    className={
                      "inline-block h-3.5 w-3.5 rounded-full bg-card transition-transform " +
                      (on ? "translate-x-4" : "translate-x-1")
                    }
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-[11px] text-muted">{p.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {save.error && (
          <p className="text-sm text-destructive">{(save.error as Error).message}</p>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted"
            disabled={save.isPending || !member?.permissionsOverride}
            onClick={() => save.mutate(null)}
            title="Quita la personalización y devuelve los permisos por defecto del rol"
          >
            Restablecer a {member?.role === "ADMIN" ? "admin completo" : "front desk"}
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-admin text-white hover:bg-admin/90"
            disabled={save.isPending || !dirty}
            onClick={() => save.mutate(Array.from(granted))}
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
