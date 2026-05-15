"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaffClockInWidget } from "@/components/staff/clock-in-widget";
import { formatCurrency } from "@/lib/utils";

interface Shift {
  id: string;
  status: string;
  clockInAt: string;
  clockOutAt: string | null;
  durationMinutes: number | null;
  studio: { id: string; name: string };
}

interface PayrollLine {
  totalHours: number;
  hourlyTotalCents: number;
  monthlyFixedCents: number;
  commissionTotalCents: number;
  totalCents: number;
  currency: string;
}

function formatCents(cents: number, currency: string) {
  return formatCurrency(cents / 100, currency);
}

export default function MyTimesheetPage() {
  const today = new Date();
  const [from, setFrom] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(
    new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10),
  );

  const tsQuery = useQuery<{ shifts: Shift[]; totalMinutes: number; totalHours: number }>({
    queryKey: ["staff", "me-ts", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/admin/staff/me/timesheet?from=${from}T00:00:00&to=${to}T00:00:00`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const prQuery = useQuery<{ period: { label: string }; line: PayrollLine | null }>({
    queryKey: ["staff", "me-pr"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/staff/me/payroll`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi timesheet</h1>
        <p className="text-sm text-muted-foreground">Tus turnos y resumen del mes.</p>
      </div>

      <StaffClockInWidget />

      {prQuery.data?.line && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Horas este mes</div>
            <div className="text-2xl font-semibold">{prQuery.data.line.totalHours.toFixed(1)}h</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Por hora</div>
            <div className="text-2xl font-semibold">{formatCents(prQuery.data.line.hourlyTotalCents, prQuery.data.line.currency)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Comisiones</div>
            <div className="text-2xl font-semibold">{formatCents(prQuery.data.line.commissionTotalCents, prQuery.data.line.currency)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-semibold text-primary">{formatCents(prQuery.data.line.totalCents, prQuery.data.line.currency)}</div>
          </CardContent></Card>
        </div>
      )}

      <Card>
        <CardContent className="flex items-end gap-3 p-4">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            Total: <b>{tsQuery.data?.totalHours.toFixed(1) ?? "0"}h</b>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {tsQuery.isLoading ? (
            <div className="p-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
          ) : (tsQuery.data?.shifts ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Clock className="mx-auto mb-2 h-6 w-6" />
              Sin turnos en este periodo.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Entrada</th>
                  <th className="px-3 py-2 text-left">Salida</th>
                  <th className="px-3 py-2 text-right">Duración</th>
                  <th className="px-3 py-2 text-left">Estudio</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {(tsQuery.data?.shifts ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs">
                      {new Date(s.clockInAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {s.clockOutAt ? new Date(s.clockOutAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.durationMinutes != null ? `${Math.floor(s.durationMinutes / 60)}h ${s.durationMinutes % 60}m` : "—"}
                    </td>
                    <td className="px-3 py-2">{s.studio.name}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
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
