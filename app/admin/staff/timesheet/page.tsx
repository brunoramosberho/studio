"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Shift {
  id: string;
  status: string;
  clockInAt: string;
  clockOutAt: string | null;
  durationMinutes: number | null;
  user: { id: string; name: string | null; email: string };
  studio: { id: string; name: string };
}

interface StudioOpt {
  id: string;
  name: string;
}

export default function TimesheetPage() {
  const today = new Date();
  const [from, setFrom] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(
    new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10),
  );
  const [studioId, setStudioId] = useState("");

  const studiosQuery = useQuery<{ studios: StudioOpt[] }>({
    queryKey: ["staff", "studios"],
    queryFn: async () => {
      const res = await fetch("/api/admin/staff/me/active-shift");
      if (!res.ok) return { studios: [] };
      const json = await res.json();
      return { studios: json.studios ?? [] };
    },
  });

  const q = useQuery<{ shifts: Shift[] }>({
    queryKey: ["staff", "timesheet-global", from, to, studioId],
    queryFn: async () => {
      const params = new URLSearchParams({ from: from + "T00:00:00", to: to + "T00:00:00" });
      if (studioId) params.set("studioId", studioId);
      const res = await fetch(`/api/admin/staff/timesheet?${params}`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const summary = useMemo(() => {
    const shifts = q.data?.shifts ?? [];
    const byUser = new Map<string, { name: string; minutes: number; shifts: number }>();
    for (const s of shifts) {
      if (s.status === "VOIDED") continue;
      const key = s.user.id;
      const existing = byUser.get(key);
      const name = s.user.name ?? s.user.email;
      if (existing) {
        existing.minutes += s.durationMinutes ?? 0;
        existing.shifts += 1;
      } else {
        byUser.set(key, { name, minutes: s.durationMinutes ?? 0, shifts: 1 });
      }
    }
    return Array.from(byUser.entries()).map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [q.data]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <Link href="/admin/staff" className="rounded-md border border-border bg-card p-2 hover:bg-accent">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timesheet</h1>
          <p className="text-sm text-muted-foreground">Horas trabajadas por persona y estudio.</p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Filter className="h-4 w-4 self-center text-muted-foreground" />
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="min-w-[180px]">
            <Label className="text-xs">Estudio</Label>
            <Select value={studioId || "all"} onValueChange={(v) => setStudioId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(studiosQuery.data?.studios ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="p-0">
            <div className="border-b border-border p-3 text-sm font-medium">
              Por persona
            </div>
            {summary.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">—</div>
            ) : (
              <ul className="divide-y divide-border">
                {summary.map((s) => (
                  <li key={s.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{s.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.floor(s.minutes / 60)}h {s.minutes % 60}m · {s.shifts} turnos
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            {q.isLoading ? (
              <div className="p-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
            ) : (q.data?.shifts ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Sin turnos.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Persona</th>
                    <th className="px-3 py-2 text-left">Estudio</th>
                    <th className="px-3 py-2 text-left">Entrada</th>
                    <th className="px-3 py-2 text-left">Salida</th>
                    <th className="px-3 py-2 text-right">Duración</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data?.shifts ?? []).map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-3 py-2">{s.user.name ?? s.user.email}</td>
                      <td className="px-3 py-2 text-xs">{s.studio.name}</td>
                      <td className="px-3 py-2 text-xs">
                        {new Date(s.clockInAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {s.clockOutAt ? new Date(s.clockOutAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.durationMinutes != null ? `${Math.floor(s.durationMinutes / 60)}h ${s.durationMinutes % 60}m` : "—"}
                      </td>
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
    </div>
  );
}
