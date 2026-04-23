"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const tabs = [
  {
    id: "scheduling",
    label: "Horarios",
    mockUI: (
      <div className="rounded-2xl border border-border bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-surface/50">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-400/60" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
            <div className="h-3 w-3 rounded-full bg-green-400/60" />
          </div>
          <div className="ml-3 flex-1 rounded-md bg-white border border-border px-3 py-1 text-xs text-muted-foreground">
            app.mgic.app/admin/schedule
          </div>
        </div>
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-foreground">Horario Semanal</h3>
              <div className="flex gap-1">
                {["← ", "7 – 13 de abril", " →"].map((t) => (
                  <span key={t} className="rounded-md bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">{t}</span>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <span className="rounded-md bg-surface px-2 py-1 text-[10px] text-muted">Todos los studios</span>
              <span className="rounded-md bg-accent text-white px-2 py-1 text-[10px] font-medium">+ Nueva clase</span>
            </div>
          </div>
          <div className="grid grid-cols-8 gap-px bg-border rounded-lg overflow-hidden text-[10px]">
            <div className="bg-surface p-2 font-medium text-muted text-right" />
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="bg-surface p-2 text-center font-semibold text-foreground">{d}</div>
            ))}
            {["6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM"].map((h, hi) => (
              <div key={h} className="contents">
                <div className="bg-white p-2 text-right text-muted-foreground border-t border-border">{h}</div>
                {[0, 1, 2, 3, 4, 5, 6].map((di) => {
                  const hasClass = (hi + di) % 3 === 0 || (hi + di) % 5 === 0;
                  const classType = (hi + di) % 3 === 0 ? "HIIT" : "Yoga";
                  const color = classType === "HIIT" ? "accent" : "violet";
                  return (
                    <div key={`${h}-${di}`} className="bg-white p-1 border-t border-border min-h-[36px]">
                      {hasClass && (
                        <div className={`rounded-md px-1.5 py-1 ${
                          color === "accent"
                            ? "bg-accent/10 border border-accent/20 text-accent"
                            : "bg-violet/10 border border-violet/20 text-violet"
                        }`}>
                          <p className="font-semibold">{classType}</p>
                          <p className="text-[8px] opacity-70">Coach {classType === "HIIT" ? "María" : "Alex"}</p>
                          <p className="text-[8px] opacity-70">{14 + ((hi + di) % 6)}/20</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "memberships",
    label: "Membresías",
    mockUI: (
      <div className="rounded-2xl border border-border bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-surface/50">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-400/60" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
            <div className="h-3 w-3 rounded-full bg-green-400/60" />
          </div>
          <div className="ml-3 flex-1 rounded-md bg-white border border-border px-3 py-1 text-xs text-muted-foreground">
            app.mgic.app/admin/packages
          </div>
        </div>
        <div className="p-4 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            {["Membresías", "Paquetes de Clases", "Tarjetas de Regalo", "Productos"].map((t, i) => (
              <span key={t} className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                i === 0 ? "bg-foreground text-white" : "bg-surface text-muted"
              }`}>{t}</span>
            ))}
          </div>
          <div className="space-y-2">
            {[
              { name: "Mensual Ilimitado", price: "$149.00", type: "Recurrente", credits: "Ilimitado", members: "86" },
              { name: "Anual Ilimitado", price: "$1,299.00", type: "Recurrente", credits: "Ilimitado", members: "42" },
              { name: "Pack 10 Clases", price: "$89.00", type: "Pago único", credits: "10 créditos", members: "128" },
              { name: "Pack 5 Clases", price: "$49.00", type: "Pago único", credits: "5 créditos", members: "94" },
              { name: "Clase Suelta", price: "$18.00", type: "Pago único", credits: "1 crédito", members: "215" },
              { name: "Intro – 2 Semanas", price: "$29.00", type: "Pago único", credits: "Ilimitado · 14 días", members: "67" },
            ].map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-xs hover:bg-surface/50 transition-colors">
                <div className="flex-1">
                  <span className="font-semibold text-foreground">{p.name}</span>
                  <span className="ml-2 text-muted-foreground">{p.credits}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    p.type === "Recurrente" ? "bg-green-100 text-green-700" : "bg-surface text-muted"
                  }`}>{p.type}</span>
                  <span className="font-semibold text-foreground w-20 text-right">{p.price}</span>
                  <span className="text-muted-foreground w-16 text-right">{p.members} activos</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "payments",
    label: "Pagos",
    mockUI: (
      <div className="rounded-2xl border border-border bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-surface/50">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-400/60" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
            <div className="h-3 w-3 rounded-full bg-green-400/60" />
          </div>
          <div className="ml-3 flex-1 rounded-md bg-white border border-border px-3 py-1 text-xs text-muted-foreground">
            app.mgic.app/admin/finances
          </div>
        </div>
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: "Ingresos Brutos", value: "$24,800", change: "+22%", good: true },
              { label: "MRR", value: "$18,200", change: "+12%", good: true },
              { label: "Membresías Activas", value: "186", change: "+8", good: true },
              { label: "Pagos Fallidos", value: "4 ($596)", change: "Reintento pendiente", good: false },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border p-3">
                <p className="text-[10px] font-medium text-muted">{k.label}</p>
                <p className="mt-1 text-xl font-bold text-foreground">{k.value}</p>
                <p className={`text-[10px] font-medium ${k.good ? "text-green-600" : "text-amber-600"}`}>{k.change}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-foreground">Ingresos (30 días)</p>
              <div className="flex gap-2 text-[10px]">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" /> Membresías</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet" /> Paquetes</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Clases sueltas</span>
              </div>
            </div>
            <div className="flex items-end gap-0.5 h-24">
              {Array.from({ length: 30 }).map((_, i) => {
                const h = 30 + Math.sin(i * 0.5) * 25 + ((i * 7) % 20);
                return (
                  <div key={i} className="flex-1 flex flex-col gap-px">
                    <div className="rounded-t bg-accent/70" style={{ height: `${h * 0.5}%` }} />
                    <div className="bg-violet/50" style={{ height: `${h * 0.3}%` }} />
                    <div className="rounded-b bg-green-400/50" style={{ height: `${h * 0.2}%` }} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            {[
              { name: "Sara M.", amount: "$149.00", desc: "Mensual Ilimitado", status: "Pagado", time: "hace 2h" },
              { name: "Javier K.", amount: "$89.00", desc: "Pack 10 Clases", status: "Pagado", time: "hace 3h" },
              { name: "Lisa R.", amount: "$149.00", desc: "Mensual Ilimitado", status: "Reintento #2", time: "hace 5h" },
            ].map((t) => (
              <div key={t.name} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{t.name}</span>
                  <span className="text-muted-foreground">{t.desc}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{t.time}</span>
                  <span className="font-semibold text-foreground">{t.amount}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                    t.status === "Pagado" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "staff",
    label: "Equipo",
    mockUI: (
      <div className="rounded-2xl border border-border bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-surface/50">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-400/60" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
            <div className="h-3 w-3 rounded-full bg-green-400/60" />
          </div>
          <div className="ml-3 flex-1 rounded-md bg-white border border-border px-3 py-1 text-xs text-muted-foreground">
            app.mgic.app/admin/coaches
          </div>
        </div>
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {[
              { name: "Coach María", specialty: "HIIT · Fuerza", rating: "4.9", classes: "48", occupancy: "92%", earnings: "$3,840", color: "bg-accent" },
              { name: "Coach Alex", specialty: "Yoga · Pilates", rating: "4.8", classes: "36", occupancy: "87%", earnings: "$2,880", color: "bg-violet" },
              { name: "Coach Diana", specialty: "Barre · Dance", rating: "4.9", classes: "32", occupancy: "85%", earnings: "$2,560", color: "bg-green-600" },
              { name: "Coach Ryan", specialty: "CrossFit · HIIT", rating: "4.7", classes: "28", occupancy: "81%", earnings: "$2,240", color: "bg-blue-600" },
            ].map((c) => (
              <div key={c.name} className="rounded-xl border border-border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`h-10 w-10 rounded-full ${c.color} flex items-center justify-center text-white font-bold text-sm`}>
                    {c.name.split(" ")[1][0]}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.specialty}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div><span className="text-muted-foreground">Calificación</span><p className="font-semibold text-foreground">⭐ {c.rating}</p></div>
                  <div><span className="text-muted-foreground">Clases</span><p className="font-semibold text-foreground">{c.classes} /mes</p></div>
                  <div><span className="text-muted-foreground">Ocupación</span><p className="font-semibold text-foreground">{c.occupancy}</p></div>
                  <div><span className="text-muted-foreground">Ingresos</span><p className="font-semibold text-foreground">{c.earnings}</p></div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="text-xs font-semibold text-foreground mb-3">Configuración de Pago — Coach María</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Base por clase", value: "$45" },
                { label: "Bono por alumno", value: "$3" },
                { label: "Bono alta ocup. (>80%)", value: "+$15" },
                { label: "Bono fin de semana", value: "+$10" },
              ].map((p) => (
                <div key={p.label} className="rounded-lg bg-surface p-2 text-[10px]">
                  <p className="text-muted-foreground">{p.label}</p>
                  <p className="font-bold text-foreground text-sm mt-0.5">{p.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "analytics",
    label: "Analítica",
    mockUI: (
      <div className="rounded-2xl border border-border bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-surface/50">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-400/60" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
            <div className="h-3 w-3 rounded-full bg-green-400/60" />
          </div>
          <div className="ml-3 flex-1 rounded-md bg-white border border-border px-3 py-1 text-xs text-muted-foreground">
            app.mgic.app/admin/reports
          </div>
        </div>
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: "Reservas de hoy", value: "47", change: "+12%", icon: "📅" },
              { label: "Ocupación promedio", value: "87%", change: "+5%", icon: "📊" },
              { label: "Nuevos miembros", value: "12", change: "+3 esta semana", icon: "👤" },
              { label: "Retención", value: "91%", change: "+2%", icon: "💎" },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-medium text-muted">{k.label}</p>
                  <span className="text-sm">{k.icon}</span>
                </div>
                <p className="text-xl font-bold text-foreground">{k.value}</p>
                <p className="text-[10px] font-medium text-green-600">{k.change}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-semibold text-foreground mb-3">Insights de Miembros</p>
              <div className="space-y-2">
                {[
                  { label: "Activos", value: "248", pct: 80, color: "bg-green-500" },
                  { label: "En Riesgo", value: "32", pct: 10, color: "bg-amber-500" },
                  { label: "Bajas", value: "18", pct: 6, color: "bg-red-500" },
                  { label: "Nuevos (7d)", value: "12", pct: 4, color: "bg-blue-500" },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-3 text-[10px]">
                    <span className="w-12 text-muted-foreground">{r.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
                      <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.pct}%` }} />
                    </div>
                    <span className="font-semibold text-foreground w-8 text-right">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-semibold text-foreground mb-3">Clases Top</p>
              <div className="space-y-2">
                {[
                  { name: "Power HIIT", bookings: 186, occ: "94%" },
                  { name: "Yoga Flow", bookings: 142, occ: "88%" },
                  { name: "Spin & Burn", bookings: 128, occ: "85%" },
                  { name: "Barre Sculpt", bookings: 96, occ: "79%" },
                ].map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">#{i + 1}</span>
                      <span className="font-medium text-foreground">{c.name}</span>
                    </span>
                    <span className="text-muted-foreground">{c.bookings} reservas · {c.occ}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

export function DashboardSection() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const active = tabs.find((t) => t.id === activeTab)!;

  return (
    <section id="dashboard" className="py-20 md:py-28 bg-surface/50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center mb-6"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground">
            Todo tu <em className="not-italic text-gradient">negocio en una caja</em>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-xl mx-auto">
            Una plataforma para gestionar horarios, membresías, pagos, staff y analítica.
            Sin complementos, sin integraciones, sin sorpresas.
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-4 sm:gap-8 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-sm sm:text-base font-medium transition-all pb-2 border-b-2 ${
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
          >
            {active.mockUI}
          </motion.div>
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-14"
        >
          <p className="text-center text-base sm:text-lg font-semibold text-foreground mb-8">
            Todo lo que necesitas para operar tu studio sin fricciones
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4 max-w-3xl mx-auto">
            {[
              "Membresías y Paquetes",
              "Pagos y POS",
              "Consentimientos con firma",
              "Sistema de Check-in",
              "Configuración de pagos a coaches",
              "Motor de gamificación",
              "Programa de referidos",
              "Feed de comunidad",
              "Marketing y UTM",
              "Multi-studio",
              "Tienda e-commerce",
              "ClassPass y Gympass",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-muted">
                <svg className="h-4 w-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
