"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

interface PayrollResp {
  period: { from: string; to: string; label: string };
  currency: string;
  lines: Array<{
    userId: string;
    userName: string | null;
    userEmail: string;
    totalHours: number;
    hourlyTotalCents: number;
    monthlyFixedCents: number;
    commissionTotalCents: number;
    totalCents: number;
    currency: string;
  }>;
  totals: {
    hourlyTotalCents: number;
    monthlyFixedCents: number;
    commissionTotalCents: number;
    totalCents: number;
    totalHours: number;
  };
}

function formatCents(cents: number, currency: string) {
  return formatCurrency(cents / 100, currency);
}

export default function PayrollPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const q = useQuery<PayrollResp>({
    queryKey: ["staff", "payroll-global", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/admin/staff/payroll?year=${year}&month=${month}`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const data = q.data;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <Link href="/admin/staff" className="rounded-md border border-border bg-card p-2 hover:bg-accent">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nómina del mes</h1>
          <p className="text-sm text-muted-foreground">Pago por hora + fijo + comisiones por staff.</p>
        </div>
      </div>

      <Card>
        <CardContent className="flex items-end gap-3 p-4">
          <div>
            <Label className="text-xs">Año</Label>
            <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="w-24" />
          </div>
          <div>
            <Label className="text-xs">Mes</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {new Date(2000, i, 1).toLocaleString("es-MX", { month: "long" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {q.isLoading || !data ? (
        <Card><CardContent className="p-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Horas</div>
              <div className="text-2xl font-semibold">{data.totals.totalHours.toFixed(0)}h</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Por hora</div>
              <div className="text-2xl font-semibold">{formatCents(data.totals.hourlyTotalCents, data.currency)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Fijo mensual</div>
              <div className="text-2xl font-semibold">{formatCents(data.totals.monthlyFixedCents, data.currency)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Total a pagar</div>
              <div className="text-2xl font-semibold text-primary">{formatCents(data.totals.totalCents, data.currency)}</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-0">
              {data.lines.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Sin staff con actividad este mes.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Persona</th>
                      <th className="px-3 py-2 text-right">Horas</th>
                      <th className="px-3 py-2 text-right">Por hora</th>
                      <th className="px-3 py-2 text-right">Fijo mes</th>
                      <th className="px-3 py-2 text-right">Comisiones</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l.userId} className="border-t border-border">
                        <td className="px-3 py-2">
                          <div className="font-medium">{l.userName ?? l.userEmail}</div>
                          <div className="text-xs text-muted-foreground">{l.userEmail}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.totalHours.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right">{formatCents(l.hourlyTotalCents, l.currency)}</td>
                        <td className="px-3 py-2 text-right">{formatCents(l.monthlyFixedCents, l.currency)}</td>
                        <td className="px-3 py-2 text-right">{formatCents(l.commissionTotalCents, l.currency)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCents(l.totalCents, l.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
