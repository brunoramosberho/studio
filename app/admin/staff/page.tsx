"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Users,
  Loader2,
  ChevronRight,
  MapPin,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/utils";

interface StaffListItem {
  membershipId: string;
  userId: string;
  role: "ADMIN" | "FRONT_DESK";
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  activeShift: {
    id: string;
    studio: { id: string; name: string };
    clockInAt: string;
  } | null;
  monthHours: number;
  monthCommissionCents: number;
}

function formatClockSince(iso: string) {
  const start = new Date(iso);
  const diffMin = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60_000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${h}h ${m}m`;
}

export default function StaffIndexPage() {
  const { data, isLoading } = useQuery<{ staff: StaffListItem[] }>({
    queryKey: ["staff", "list"],
    queryFn: async () => {
      const res = await fetch("/api/admin/staff");
      if (!res.ok) throw new Error("Error loading staff");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const staff = data?.staff ?? [];
  const activeCount = staff.filter((s) => s.activeShift).length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff y nómina</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administra checadas, sueldos y comisiones del personal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/staff/timesheet"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
          >
            Ver timesheet
          </Link>
          <Link
            href="/admin/staff/payroll"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Nómina del mes
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{staff.length}</div>
              <div className="text-xs text-muted-foreground">Staff total</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{activeCount}</div>
              <div className="text-xs text-muted-foreground">En turno ahora</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold">
                {staff.reduce((s, x) => s + x.monthHours, 0).toFixed(0)}h
              </div>
              <div className="text-xs text-muted-foreground">Horas este mes</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : staff.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No hay personal registrado. Invita usuarios desde{" "}
              <Link href="/admin/team" className="underline">
                Staff y permisos
              </Link>
              .
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {staff.map((s) => (
                <li key={s.membershipId}>
                  <Link
                    href={`/admin/staff/${s.membershipId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent"
                  >
                    <Avatar className="h-9 w-9">
                      {s.user.image ? (
                        <AvatarImage src={s.user.image} alt={s.user.name ?? ""} />
                      ) : null}
                      <AvatarFallback>
                        {(s.user.name ?? s.user.email).slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {s.user.name ?? s.user.email}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {s.role === "ADMIN" ? "Admin" : "Front desk"}
                        </Badge>
                        {s.activeShift && (
                          <Badge className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                            <Clock className="mr-1 h-3 w-3" />
                            {formatClockSince(s.activeShift.clockInAt)} ·{" "}
                            <MapPin className="mx-1 h-3 w-3" />
                            {s.activeShift.studio.name}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.user.email}
                      </div>
                    </div>
                    <div className="hidden text-right text-xs sm:block">
                      <div className="font-medium tabular-nums">
                        {s.monthHours.toFixed(1)}h
                      </div>
                      <div className="text-muted-foreground">
                        {formatCurrency(s.monthCommissionCents / 100, "MXN")} comisión
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
