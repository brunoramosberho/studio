"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Plus, Trash2, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface HolidayItem {
  date: string; // YYYY-MM-DD
  name: string;
}
interface CustomHoliday extends HolidayItem {
  id: string;
}
interface HolidaysResponse {
  year: number;
  countryCode: string | null;
  countryName: string | null;
  national: HolidayItem[];
  custom: CustomHoliday[];
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function HolidaysPage() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  const { data, isLoading } = useQuery<HolidaysResponse>({
    queryKey: ["staff", "holidays", year],
    queryFn: async () => {
      const res = await fetch(`/api/admin/staff/holidays?year=${year}`);
      if (!res.ok) throw new Error("Error loading holidays");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: { date: string; name: string }) => {
      const res = await fetch("/api/admin/staff/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff", "holidays"] });
      setNewDate("");
      setNewName("");
      toast.success("Festivo agregado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/admin/staff/holidays", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff", "holidays"] });
      toast.success("Festivo eliminado");
    },
    onError: () => toast.error("Error al eliminar"),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate || !newName.trim()) return;
    addMutation.mutate({ date: newDate, name: newName.trim() });
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <Link
          href="/admin/staff"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Staff y nómina
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Festivos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los festivos activan el recargo configurado en las tarifas de los instructores
          (opción «Aplicar en festivos»). Los festivos nacionales se detectan automáticamente;
          aquí puedes añadir los regionales o locales.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setYear((y) => y - 1)}>
          {year - 1}
        </Button>
        <span className="min-w-16 text-center text-lg font-semibold tabular-nums">{year}</span>
        <Button variant="outline" size="sm" onClick={() => setYear((y) => y + 1)}>
          {year + 1}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Custom / regional */}
          <Card>
            <CardContent className="p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="h-4 w-4" />
                Festivos personalizados
              </h2>

              <form onSubmit={handleAdd} className="mb-3 flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Fecha</label>
                  <Input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="h-9 w-40 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Nombre</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="ej: Fiesta local"
                    className="h-9 text-sm"
                  />
                </div>
                <Button type="submit" size="sm" className="h-9 gap-1" disabled={addMutation.isPending}>
                  <Plus className="h-4 w-4" />
                  Agregar
                </Button>
              </form>

              {data && data.custom.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No has agregado festivos personalizados.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data?.custom.map((h) => (
                    <li key={h.id} className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-sm font-medium">{h.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{formatDate(h.date)}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(h.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* National (read-only) */}
          <Card>
            <CardContent className="p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="h-4 w-4" />
                Festivos nacionales
                {data?.countryName && (
                  <Badge variant="outline" className="text-[10px]">
                    {data.countryName}
                  </Badge>
                )}
              </h2>
              {data && data.national.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No hay un calendario nacional para el país del estudio. Agrega los festivos manualmente.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data?.national.map((h) => (
                    <li key={h.date} className="flex items-center justify-between py-2">
                      <span className="text-sm">{h.name}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(h.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
