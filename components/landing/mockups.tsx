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
        "relative w-[260px] rounded-[2.5rem] border-[6px] border-gray-900 bg-gray-900 p-1 shadow-2xl dark:border-gray-700",
        className,
      )}
    >
      {/* Notch */}
      <div className="absolute left-1/2 top-0 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-gray-900 dark:bg-gray-700" />
      <div className="overflow-hidden rounded-[2rem] bg-white" style={{ height: 520 }}>
        {children}
      </div>
    </div>
  );
}

export function BrowserFrame({
  children,
  url = "app.reserva.fit",
  className,
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <div className="ml-4 flex-1 rounded-md bg-gray-100 px-3 py-1 text-center text-[10px] font-medium text-gray-400 dark:bg-gray-800 dark:text-gray-500">
          {url}
        </div>
      </div>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export function AdminDashboardMockup() {
  return (
    <div className="bg-[#FAF9F6] p-4" style={{ minHeight: 340 }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-[#8C8279]">Dashboard</p>
          <p className="text-sm font-bold text-[#1C1917]" style={{ fontFamily: "var(--font-jakarta)" }}>
            BE TORO Studio
          </p>
        </div>
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#C9A96E] to-[#A67C3D]" />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Reservas hoy", value: "47", delta: "+12%" },
          { label: "Revenue mes", value: "$84k", delta: "+8%" },
          { label: "Ocupación", value: "87%", delta: "+5%" },
          { label: "Nuevos", value: "23", delta: "+18%" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg bg-white p-2 shadow-sm">
            <p className="text-[8px] text-[#8C8279]">{kpi.label}</p>
            <p className="text-sm font-bold text-[#1C1917]">{kpi.value}</p>
            <span className="text-[8px] font-medium text-emerald-500">{kpi.delta}</span>
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div className="mt-3 rounded-lg bg-white p-3 shadow-sm">
        <p className="text-[9px] font-semibold text-[#1C1917]">Revenue semanal</p>
        <div className="mt-2 flex items-end gap-1">
          {[40, 55, 35, 70, 60, 85, 75].map((h, i) => (
            <div key={i} className="flex-1">
              <div
                className="rounded-t bg-gradient-to-t from-[#C9A96E] to-[#E8D9BF]"
                style={{ height: h * 0.6 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[7px] text-[#8C8279]">
          <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
        </div>
      </div>

      {/* AI alert */}
      <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]">🤖</span>
          <p className="text-[8px] font-semibold text-purple-700">AI Assistant</p>
        </div>
        <p className="mt-1 text-[8px] leading-relaxed text-purple-600">
          3 clientes no han reservado en 14 días. Enviar campaña de reactivación podría recuperar ~$2,400 este mes.
        </p>
      </div>

      {/* Classes list */}
      <div className="mt-3 rounded-lg bg-white p-2 shadow-sm">
        <p className="text-[9px] font-semibold text-[#1C1917]">Clases de hoy</p>
        {[
          { name: "Reformer Flow", time: "07:00", coach: "Laura M.", spots: "12/14" },
          { name: "Pilates Mat", time: "09:00", coach: "Carlos R.", spots: "8/10" },
          { name: "Barre Sculpt", time: "10:30", coach: "Ana P.", spots: "14/14" },
        ].map((c) => (
          <div key={c.name} className="mt-1.5 flex items-center justify-between text-[8px]">
            <div>
              <span className="font-medium text-[#1C1917]">{c.name}</span>
              <span className="ml-1.5 text-[#8C8279]">{c.time}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#8C8279]">{c.coach}</span>
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
    <div className="bg-[#FAF9F6] p-4" style={{ minHeight: 340 }}>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600" />
        <div>
          <p className="text-xs text-[#8C8279]">Coach Portal</p>
          <p className="text-sm font-bold text-[#1C1917]" style={{ fontFamily: "var(--font-jakarta)" }}>
            Laura Martínez
          </p>
        </div>
      </div>

      {/* Next class card */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-3 text-white">
        <p className="text-[10px] font-medium text-emerald-200">Próxima clase</p>
        <p className="mt-0.5 text-sm font-bold">Reformer Flow</p>
        <p className="text-[10px] text-emerald-200">Hoy 18:00 · Sala A · 12/14 reservas</p>
      </div>

      {/* Attendees */}
      <div className="mt-3 rounded-lg bg-white p-3 shadow-sm">
        <p className="mb-2 text-[9px] font-semibold text-[#1C1917]">Asistentes confirmados</p>
        {[
          { name: "María García", spot: 4, status: "Confirmada" },
          { name: "Ana López", spot: 7, status: "Confirmada" },
          { name: "Carmen Ruiz", spot: 2, status: "Confirmada" },
          { name: "Isabel Torres", spot: 11, status: "Check-in" },
          { name: "Sofia Herrera", spot: 5, status: "Confirmada" },
        ].map((a) => (
          <div key={a.name} className="mt-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-gray-200" />
              <span className="text-[8px] font-medium text-[#1C1917]">{a.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[8px] text-[#8C8279]">Lugar {a.spot}</span>
              <span className={cn("text-[7px] font-medium", a.status === "Check-in" ? "text-indigo-500" : "text-emerald-500")}>
                {a.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "Clases este mes", value: "24" },
          { label: "Avg. ocupación", value: "91%" },
          { label: "Rating", value: "4.9 ★" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-white p-2 text-center shadow-sm">
            <p className="text-sm font-bold text-emerald-600">{s.value}</p>
            <p className="text-[7px] text-[#8C8279]">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
