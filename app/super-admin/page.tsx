"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, UserCheck, CalendarCheck, Package } from "lucide-react";

interface Stats {
  totalTenants: number;
  totalUsers: number;
  activeMemberships: number;
  bookingsThisMonth: number;
  packagesSoldThisMonth: number;
}

const kpis = [
  { key: "totalTenants" as const, label: "Tenants", icon: Building2, color: "text-indigo-600 bg-indigo-50" },
  { key: "totalUsers" as const, label: "Usuarios", icon: Users, color: "text-blue-600 bg-blue-50" },
  { key: "activeMemberships" as const, label: "Membresías activas", icon: UserCheck, color: "text-emerald-600 bg-emerald-50" },
  { key: "bookingsThisMonth" as const, label: "Reservas este mes", icon: CalendarCheck, color: "text-amber-600 bg-amber-50" },
  { key: "packagesSoldThisMonth" as const, label: "Paquetes vendidos este mes", icon: Package, color: "text-purple-600 bg-purple-50" },
];

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/super-admin/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">
        Dashboard
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Vista general de la plataforma
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi) => (
          <Card key={kpi.key} className="border border-gray-100">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${kpi.color}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500">{kpi.label}</p>
                {stats ? (
                  <p className="mt-0.5 text-2xl font-bold text-gray-900">
                    {stats[kpi.key].toLocaleString("es-MX")}
                  </p>
                ) : (
                  <Skeleton className="mt-1 h-7 w-16" />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
