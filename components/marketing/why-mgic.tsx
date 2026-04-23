"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const tabs = [
  {
    id: "scheduling",
    title: "Reservas Inteligentes",
    headline: "Un horario que se llena solo",
    description:
      "Vista semanal drag-and-drop, clases recurrentes, listas de espera que promueven automáticamente y gestión de disponibilidad de coaches — todo conectado. Los miembros ven cupos en tiempo real, reservan al instante y reciben recordatorios automáticos.",
    features: [
      "Calendario semanal con drag-and-drop",
      "Promoción automática desde lista de espera",
      "Disponibilidad de coaches y detección de conflictos",
      "Gestión de salas multi-studio",
      "Bloqueo de cupos y control de capacidad",
    ],
    mockUI: "schedule",
  },
  {
    id: "payments",
    title: "Pagos y Paquetes",
    headline: "Cobra sin perseguir a nadie",
    description:
      "Pagos con Stripe, paquetes de clases, membresías recurrentes, reintentos automáticos en cobros fallidos y un dashboard financiero completo. Ve tu MRR, proyecta renovaciones y exporta todo con un solo clic.",
    features: [
      "Integración con Stripe Connect",
      "Paquetes de clases y membresías recurrentes",
      "Reintentos automáticos en pagos fallidos",
      "Dashboard de ingresos con seguimiento de MRR",
      "Exportes financieros con un clic",
    ],
    mockUI: "payments",
  },
  {
    id: "members",
    title: "Gestión de Miembros",
    headline: "Conoce a cada miembro por nombre — y por datos",
    description:
      "CRM completo con detección de riesgo, insights de engagement y seguimiento de ciclo de vida. Ve quién está en riesgo de irse, quiénes son tus mejores miembros y quiénes solo necesitan un empujón para regresar.",
    features: [
      "Filtros inteligentes: activos, en riesgo, nuevos, por vencer",
      "Insights de miembros y puntaje de engagement",
      "Historial de visitas y seguimiento de créditos",
      "Consentimientos digitales con firma electrónica",
      "Recordatorios automatizados de ciclo de vida",
    ],
    mockUI: "members",
  },
  {
    id: "coaches",
    title: "Herramientas para Coaches",
    headline: "Tus coaches merecen algo mejor que una hoja de cálculo",
    description:
      "Cada coach tiene su propio dashboard con estadísticas de clases, desglose de ingresos, ranking de fans y gestión de disponibilidad. Configura pagos flexibles — por clase, por alumno o por tramos según ocupación.",
    features: [
      "Dashboard personal del coach con estadísticas",
      "Pagos flexibles: fijo, por clase, por alumno, por tramos",
      "Ranking de fans e insights de mejores alumnos",
      "Bloqueos de disponibilidad con flujo de aprobación",
      "Bio, especialidades y certificaciones",
    ],
    mockUI: "coaches",
  },
  {
    id: "marketing",
    title: "Marketing y Crecimiento",
    headline: "Convierte cada clase en un motor de crecimiento",
    description:
      "Enlaces con seguimiento UTM, códigos QR, integración con Instagram, programas de referidos y promociones destacadas — todo integrado. Mide qué campañas generan reservas reales, no solo clics.",
    features: [
      "Seguimiento UTM con atribución de conversiones",
      "Generación de códigos QR para campañas",
      "Programa de referidos con cola de recompensas",
      "Integración de medios con Instagram",
      "Promociones destacadas y banners",
    ],
    mockUI: "marketing",
  },
];

function MockSchedule() {
  const hours = ["6 AM", "7 AM", "8 AM", "9 AM", "10 AM"];
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie"];
  return (
    <div className="rounded-xl border border-border bg-white p-4 text-xs">
      <div className="grid grid-cols-6 gap-1">
        <div />
        {days.map((d) => (
          <div key={d} className="text-center font-semibold text-muted py-1">{d}</div>
        ))}
        {hours.map((h) => (
          <React.Fragment key={h}>
            <div className="text-right pr-2 text-muted-foreground py-2">{h}</div>
            {days.map((d, di) => (
              <div
                key={`${h}-${d}`}
                className={`rounded-lg py-2 px-1 text-center ${
                  (di + hours.indexOf(h)) % 3 === 0
                    ? "bg-accent/10 text-accent font-medium border border-accent/20"
                    : (di + hours.indexOf(h)) % 3 === 1
                    ? "bg-violet/10 text-violet font-medium border border-violet/20"
                    : "bg-surface"
                }`}
              >
                {(di + hours.indexOf(h)) % 3 === 0
                  ? "HIIT"
                  : (di + hours.indexOf(h)) % 3 === 1
                  ? "Yoga"
                  : ""}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function MockPayments() {
  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Ingresos Brutos", value: "$24,800", sub: "Este mes" },
          { label: "MRR", value: "$18,200", sub: "+12% vs mes anterior" },
          { label: "Membresías Activas", value: "186", sub: "3 por vencer" },
        ].map((k) => (
          <div key={k.label} className="rounded-lg bg-surface p-3">
            <p className="text-[10px] font-medium text-muted">{k.label}</p>
            <p className="text-lg font-bold text-foreground">{k.value}</p>
            <p className="text-[10px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { name: "Sara M.", amount: "$149", type: "Mensual Ilimitado", status: "Pagado" },
          { name: "Javier K.", amount: "$89", type: "Pack 10 Clases", status: "Pagado" },
          { name: "Lisa R.", amount: "$149", type: "Mensual Ilimitado", status: "Reintento" },
        ].map((t) => (
          <div
            key={t.name}
            className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs"
          >
            <div>
              <span className="font-medium text-foreground">{t.name}</span>
              <span className="ml-2 text-muted-foreground">{t.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{t.amount}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  t.status === "Pagado"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {t.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockMembers() {
  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="flex gap-2">
        {["Todos", "Activos", "En Riesgo", "Nuevos"].map((f, i) => (
          <span
            key={f}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              i === 0 ? "bg-foreground text-white" : "bg-surface text-muted"
            }`}
          >
            {f}
          </span>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { name: "Ana García", classes: 24, last: "Hoy", status: "Activa", risk: false },
          { name: "Carlos Ruiz", classes: 18, last: "hace 3 días", status: "Activo", risk: false },
          { name: "Emma Wilson", classes: 6, last: "hace 12 días", status: "En Riesgo", risk: true },
          { name: "David Chen", classes: 2, last: "hace 21 días", status: "En Riesgo", risk: true },
        ].map((m) => (
          <div
            key={m.name}
            className="flex items-center justify-between rounded-lg bg-surface px-3 py-2.5 text-xs"
          >
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-[10px]">
                {m.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <span className="font-medium text-foreground">{m.name}</span>
                <span className="ml-2 text-muted-foreground">{m.classes} clases</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Última: {m.last}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  m.risk ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                }`}
              >
                {m.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCoaches() {
  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          { name: "Coach María", rating: "4.9", classes: "48", specialty: "HIIT · Fuerza", color: "bg-accent" },
          { name: "Coach Alex", rating: "4.8", classes: "36", specialty: "Yoga · Pilates", color: "bg-violet" },
        ].map((c) => (
          <div key={c.name} className="rounded-lg bg-surface p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full ${c.color} flex items-center justify-center text-white font-bold text-xs`}
              >
                {c.name.split(" ")[1][0]}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{c.name}</p>
                <p className="text-[10px] text-muted-foreground">{c.specialty}</p>
              </div>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Calificación: <strong className="text-foreground">{c.rating}</strong></span>
              <span className="text-muted-foreground">Clases: <strong className="text-foreground">{c.classes}</strong></span>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-surface p-3">
        <p className="text-[10px] font-semibold text-foreground mb-2">Configuración de Pago</p>
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <div className="flex justify-between">
            <span>Base por clase</span>
            <span className="font-medium text-foreground">$45</span>
          </div>
          <div className="flex justify-between">
            <span>Bono por alumno</span>
            <span className="font-medium text-foreground">$3</span>
          </div>
          <div className="flex justify-between">
            <span>Bono por alta ocupación (&gt;80%)</span>
            <span className="font-medium text-foreground">+$15</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockMarketing() {
  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="rounded-lg bg-surface p-3">
        <p className="text-[10px] font-semibold text-foreground mb-2">Rendimiento de Campañas</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Clics totales", value: "2,340" },
            { label: "Conversiones", value: "186" },
            { label: "Tasa de conv.", value: "7.9%" },
          ].map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-lg font-bold text-foreground">{m.value}</p>
              <p className="text-[10px] text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {[
          { name: "Lanzamiento HIIT Verano", clicks: "890", conv: "72", source: "Instagram" },
          { name: "Refiere a un Amigo", clicks: "654", conv: "58", source: "Referido" },
          { name: "Yoga Año Nuevo", clicks: "796", conv: "56", source: "Código QR" },
        ].map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs"
          >
            <div>
              <span className="font-medium text-foreground">{c.name}</span>
              <span className="ml-2 text-muted-foreground">{c.source}</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{c.clicks} clics</span>
              <span className="font-medium text-accent">{c.conv} conv.</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const mockComponents: Record<string, () => React.JSX.Element> = {
  schedule: MockSchedule,
  payments: MockPayments,
  members: MockMembers,
  coaches: MockCoaches,
  marketing: MockMarketing,
};

export function WhyMgic() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const active = tabs.find((t) => t.id === activeTab)!;
  const MockComponent = mockComponents[active.mockUI];

  return (
    <section id="why-mgic" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center mb-12"
        >
          <p className="text-sm font-semibold text-accent mb-3">Por qué Mgic</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Todo lo que necesitas,{" "}
            <em className="not-italic text-gradient">nada</em> que no
          </h2>
          <p className="mt-4 text-lg text-muted">
            Una plataforma que realmente reemplaza las diez que hoy tienes funcionando.
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-foreground text-white shadow-lg"
                  : "bg-surface text-muted hover:bg-border/60"
              }`}
            >
              {tab.title}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="grid md:grid-cols-2 gap-10 items-start"
          >
            <div className="space-y-6">
              <h3 className="text-2xl sm:text-3xl font-bold text-foreground">{active.headline}</h3>
              <p className="text-base text-muted leading-relaxed">{active.description}</p>
              <ul className="space-y-3">
                {active.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10">
                      <svg
                        className="h-3 w-3 text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span className="text-sm text-muted">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <MockComponent />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
