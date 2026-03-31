"use client";

import { motion } from "framer-motion";
import { FadeIn } from "./motion";
import { IPhoneFrame, BrowserFrame, AdminDashboardMockup, CoachViewMockup } from "./mockups";

export function Showcase() {
  return (
    <section className="overflow-hidden bg-gray-50 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-tight text-orange-500">Plataforma</p>
          <h2
            className="mt-3 text-3xl font-semibold tracking-tighter text-gray-900 sm:text-4xl"
          >
            Tres experiencias. Una plataforma.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            App del miembro, dashboard de admin y portal del coach — todo conectado en tiempo real.
          </p>
        </FadeIn>

        <div className="mt-16 grid items-center gap-12 lg:grid-cols-3">
          {/* Admin dashboard */}
          <FadeIn delay={0.1}>
            <div className="text-center lg:text-left">
              <span className="inline-block rounded-md bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
                Admin
              </span>
              <h3 className="mt-3 text-lg font-semibold tracking-tight text-gray-900">
                Control total
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Dashboard con métricas, revenue, alertas del AI assistant y gestión de clases.
              </p>
            </div>
            <BrowserFrame url="betoro.reserva.fit/admin" className="mt-6">
              <AdminDashboardMockup />
            </BrowserFrame>
          </FadeIn>

          {/* iPhone member app */}
          <FadeIn delay={0.2} className="flex justify-center">
            <div>
              <div className="mb-6 text-center">
                <span className="inline-block rounded-md bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">
                  Miembros
                </span>
                <h3 className="mt-3 text-lg font-semibold tracking-tight text-gray-900">
                  La app de tus clientes
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Feed social, reservas, paquetes y perfil — tu marca, su experiencia.
                </p>
              </div>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <IPhoneFrame>
                  <MemberAppMockup />
                </IPhoneFrame>
              </motion.div>
            </div>
          </FadeIn>

          {/* Coach view */}
          <FadeIn delay={0.3}>
            <div className="text-center lg:text-left">
              <span className="inline-block rounded-md bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                Coach
              </span>
              <h3 className="mt-3 text-lg font-semibold tracking-tight text-gray-900">
                Portal del coach
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Próxima clase, asistentes, check-in y stats de rendimiento.
              </p>
            </div>
            <BrowserFrame url="betoro.reserva.fit/coach" className="mt-6">
              <CoachViewMockup />
            </BrowserFrame>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function MemberAppMockup() {
  const days = [
    { d: "lun", n: "13" },
    { d: "mar", n: "14" },
    { d: "mié", n: "15", active: true, today: true },
    { d: "jue", n: "16" },
    { d: "vie", n: "17" },
    { d: "sáb", n: "18" },
    { d: "dom", n: "19" },
  ];

  const classes = [
    { name: "Reformer Flow", time: "07:00", dur: "50", coach: "Laura", color: "#C9A96E", spots: "2 lugares", initials: "LM" },
    { name: "Pilates Mat", time: "09:00", dur: "50", coach: "Carlos", color: "#2D5016", spots: "5 lugares", initials: "CR" },
    { name: "Barre Sculpt", time: "10:30", dur: "50", coach: "Ana", color: "#9F1239", spots: null, initials: "AP" },
    { name: "Reformer Pro", time: "12:00", dur: "50", coach: "Laura", color: "#C9A96E", spots: "8 lugares", initials: "LM" },
    { name: "Yoga Flow", time: "17:00", dur: "50", coach: "Diana", color: "#1A2C4E", spots: "3 lugares", initials: "DL" },
  ];

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <span className="text-[10px] font-semibold text-gray-900">9:41</span>
        <div className="flex items-center gap-1">
          <div className="h-2 w-3 rounded-sm bg-gray-900" />
          <div className="h-2 w-2 rounded-full border border-gray-900" />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-2 pb-2">
        <div>
          <p className="text-[13px] font-bold text-gray-900">Horarios</p>
          <p className="text-[9px] text-gray-400">Semana del 13 de enero</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5">
          <div className="h-2 w-2 rounded-sm bg-orange-400" />
          <span className="text-[8px] font-semibold text-orange-500">5 clases</span>
        </div>
      </div>

      {/* Day strip */}
      <div className="flex gap-1 px-3 pb-2">
        {days.map((day) => (
          <div
            key={day.d}
            className={`flex flex-1 flex-col items-center rounded-lg px-1 py-1.5 ${
              day.active
                ? "bg-gray-900 text-white"
                : "text-gray-400"
            }`}
          >
            <span className="text-[7px] font-semibold uppercase tracking-wide">
              {day.d}
            </span>
            <span className={`text-[12px] font-bold ${day.active ? "text-white" : "text-gray-900"}`}>
              {day.n}
            </span>
            {day.today && day.active && (
              <div className="mt-0.5 h-0.5 w-0.5 rounded-full bg-white" />
            )}
          </div>
        ))}
      </div>

      {/* Class list */}
      <div className="flex-1 space-y-1.5 overflow-hidden px-3 pb-1">
        {classes.map((c) => (
          <div
            key={c.time + c.name}
            className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-2.5 py-2"
          >
            {/* Time */}
            <div className="w-8 flex-shrink-0 text-center">
              <p className="text-[10px] font-bold text-gray-900">{c.time}</p>
              <p className="text-[7px] text-gray-400">{c.dur}m</p>
            </div>

            {/* Color bar */}
            <div
              className="h-7 w-[2px] flex-shrink-0 rounded-full"
              style={{ backgroundColor: c.color + "60" }}
            />

            {/* Avatar */}
            <div
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[6px] font-bold text-white"
              style={{ backgroundColor: c.color }}
            >
              {c.initials}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span
                  className="rounded-full border px-1.5 py-[1px] text-[7px] font-semibold"
                  style={{
                    borderColor: c.color + "30",
                    backgroundColor: c.color + "12",
                    color: c.color,
                  }}
                >
                  {c.name}
                </span>
              </div>
              <p className="mt-0.5 text-[7px] text-gray-400">con {c.coach}</p>
            </div>

            {/* Spots */}
            <div className="flex-shrink-0 text-right">
              {c.spots ? (
                <span className="text-[7px] font-medium text-gray-400">{c.spots}</span>
              ) : (
                <span className="rounded-full bg-amber-50 px-1.5 py-[1px] text-[7px] font-semibold text-amber-600">
                  Llena
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom nav — matches real MobileNav */}
      <div className="relative mt-auto border-t border-gray-100 bg-white/95 px-1 pb-1.5 pt-2.5">
        {/* FAB */}
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center rounded-full text-white shadow-[0_2px_8px_rgba(216,90,48,0.35)]"
          style={{
            backgroundColor: "#D85A30",
            width: 32,
            height: 32,
            top: -13,
          }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>

        <div className="flex items-end justify-between">
          {/* Left tabs */}
          <div className="flex flex-1 justify-around">
            {[
              { label: "Feed", active: false },
              { label: "Mis clases", active: false },
            ].map((tab) => (
              <div key={tab.label} className="flex flex-col items-center gap-0.5 px-1 py-0.5">
                <div className={`h-3 w-3 rounded-sm ${tab.active ? "bg-orange-400" : "bg-gray-300"}`} />
                <span className={`text-[6px] font-medium ${tab.active ? "text-orange-500" : "text-gray-400"}`}>
                  {tab.label}
                </span>
              </div>
            ))}
          </div>

          {/* Center spacer for FAB */}
          <div className="flex w-12 shrink-0 flex-col items-center gap-0.5 px-1 py-0.5">
            <div className="h-3 w-3" />
            <span className="text-[6px] font-medium text-orange-500">Reserva</span>
          </div>

          {/* Right tabs */}
          <div className="flex flex-1 justify-around">
            {[
              { label: "Shop", active: false },
              { label: "Perfil", active: false },
            ].map((tab) => (
              <div key={tab.label} className="flex flex-col items-center gap-0.5 px-1 py-0.5">
                <div className={`h-3 w-3 rounded-sm ${tab.active ? "bg-orange-400" : "bg-gray-300"}`} />
                <span className={`text-[6px] font-medium ${tab.active ? "text-orange-500" : "text-gray-400"}`}>
                  {tab.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
