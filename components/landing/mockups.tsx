"use client";

import { cn } from "@/lib/utils";

export function IPhoneFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-[260px] rounded-[2rem] border-[5px] border-gray-900 bg-gray-900 shadow-2xl",
        className,
      )}
    >
      <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-xl bg-gray-900" />
      <div className="overflow-hidden rounded-[1.6rem] bg-white" style={{ height: 520 }}>
        {children}
      </div>
    </div>
  );
}

export function BrowserFrame({
  children,
  url = "app.mgic.app",
  className,
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-gray-300" />
          <div className="h-2 w-2 rounded-full bg-gray-300" />
          <div className="h-2 w-2 rounded-full bg-gray-300" />
        </div>
        <div className="ml-3 flex-1 rounded bg-gray-100 px-3 py-1 text-center text-[10px] font-medium text-gray-400">
          {url}
        </div>
      </div>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export function AdminDashboardMockup() {
  return (
    <div className="bg-[#FAFAF9] p-4" style={{ minHeight: 340 }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-gray-500">Dashboard</p>
          <p className="text-sm font-bold text-gray-900">BE TORO Studio</p>
        </div>
        <div className="h-6 w-6 rounded-md bg-gradient-to-br from-orange-400 to-orange-500" />
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: "Reservas hoy", value: "47", delta: "+12%" },
          { label: "Revenue mes", value: "$84k", delta: "+8%" },
          { label: "Ocupación", value: "87%", delta: "+5%" },
          { label: "Nuevos", value: "23", delta: "+18%" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-md bg-white p-2 ring-1 ring-gray-200/60">
            <p className="text-[7px] text-gray-500">{kpi.label}</p>
            <p className="text-sm font-bold text-gray-900">{kpi.value}</p>
            <span className="text-[7px] font-medium text-emerald-500">{kpi.delta}</span>
          </div>
        ))}
      </div>

      <div className="mt-2.5 rounded-md bg-white p-2.5 ring-1 ring-gray-200/60">
        <p className="text-[9px] font-semibold text-gray-900">Revenue semanal</p>
        <div className="mt-2 flex items-end gap-0.5">
          {[40, 55, 35, 70, 60, 85, 75].map((h, i) => (
            <div key={i} className="flex-1">
              <div
                className="rounded-sm bg-gradient-to-t from-orange-500 to-orange-300"
                style={{ height: h * 0.55 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[7px] text-gray-400">
          <span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span>
        </div>
      </div>

      <div className="mt-2.5 rounded-md border border-purple-100 bg-purple-50/60 p-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px]">🤖</span>
          <p className="text-[8px] font-semibold text-purple-700">AI Assistant</p>
        </div>
        <p className="mt-0.5 text-[7px] leading-relaxed text-purple-600">
          3 clientes no han reservado en 14 días. Reactivación podría recuperar ~$2,400.
        </p>
      </div>

      <div className="mt-2.5 rounded-md bg-white p-2 ring-1 ring-gray-200/60">
        <p className="text-[9px] font-semibold text-gray-900">Clases de hoy</p>
        {[
          { name: "Reformer Flow", time: "07:00", coach: "Laura M.", spots: "12/14" },
          { name: "Pilates Mat", time: "09:00", coach: "Carlos R.", spots: "8/10" },
          { name: "Barre Sculpt", time: "10:30", coach: "Ana P.", spots: "14/14" },
        ].map((c) => (
          <div key={c.name} className="mt-1.5 flex items-center justify-between text-[8px]">
            <div>
              <span className="font-medium text-gray-900">{c.name}</span>
              <span className="ml-1.5 text-gray-400">{c.time}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">{c.coach}</span>
              <span className={cn("font-medium", c.spots === "14/14" ? "text-red-500" : "text-emerald-500")}>{c.spots}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CoachViewMockup() {
  return (
    <div className="bg-[#FAFAF9] p-4" style={{ minHeight: 340 }}>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600" />
        <div>
          <p className="text-[10px] text-gray-500">Coach Portal</p>
          <p className="text-sm font-bold text-gray-900">Laura Martínez</p>
        </div>
      </div>

      <div className="rounded-md bg-gradient-to-br from-emerald-600 to-emerald-700 p-3 text-white">
        <p className="text-[10px] font-medium text-emerald-200">Próxima clase</p>
        <p className="mt-0.5 text-sm font-bold">Reformer Flow</p>
        <p className="text-[10px] text-emerald-200">Hoy 18:00 · Sala A · 12/14 reservas</p>
      </div>

      <div className="mt-2.5 rounded-md bg-white p-2.5 ring-1 ring-gray-200/60">
        <p className="mb-2 text-[9px] font-semibold text-gray-900">Asistentes confirmados</p>
        {[
          { name: "María García", spot: 4, status: "Confirmada" },
          { name: "Ana López", spot: 7, status: "Confirmada" },
          { name: "Carmen Ruiz", spot: 2, status: "Confirmada" },
          { name: "Isabel Torres", spot: 11, status: "Check-in" },
          { name: "Sofia Herrera", spot: 5, status: "Confirmada" },
        ].map((a) => (
          <div key={a.name} className="mt-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-gray-100" />
              <span className="text-[8px] font-medium text-gray-900">{a.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[7px] text-gray-400">Lugar {a.spot}</span>
              <span className={cn("text-[7px] font-medium", a.status === "Check-in" ? "text-orange-500" : "text-emerald-500")}>
                {a.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {[
          { label: "Clases este mes", value: "24" },
          { label: "Avg. ocupación", value: "91%" },
          { label: "Rating", value: "4.9 ★" },
        ].map((s) => (
          <div key={s.label} className="rounded-md bg-white p-2 text-center ring-1 ring-gray-200/60">
            <p className="text-sm font-bold text-emerald-600">{s.value}</p>
            <p className="text-[7px] text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
