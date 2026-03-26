"use client";

import { motion } from "framer-motion";
import { FadeIn } from "./motion";
import { IPhoneFrame, BrowserFrame, AdminDashboardMockup, CoachViewMockup } from "./mockups";

export function Showcase() {
  return (
    <section className="overflow-hidden bg-gray-50 py-24 dark:bg-gray-900/50">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Plataforma</p>
          <h2
            className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl dark:text-white"
            style={{ fontFamily: "var(--font-jakarta)" }}
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
              <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                Admin
              </span>
              <h3 className="mt-3 text-lg font-bold text-gray-900 dark:text-white" style={{ fontFamily: "var(--font-jakarta)" }}>
                Control total
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
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
                <span className="inline-block rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600 dark:bg-pink-500/10 dark:text-pink-400">
                  Miembros
                </span>
                <h3 className="mt-3 text-lg font-bold text-gray-900 dark:text-white" style={{ fontFamily: "var(--font-jakarta)" }}>
                  La app de tus clientes
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
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
              <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                Coach
              </span>
              <h3 className="mt-3 text-lg font-bold text-gray-900 dark:text-white" style={{ fontFamily: "var(--font-jakarta)" }}>
                Portal del coach
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
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
  return (
    <div className="flex h-full flex-col bg-[#FAF9F6]">
      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <span className="text-xs font-semibold text-[#1C1917]">9:41</span>
        <div className="flex gap-1">
          <div className="h-2.5 w-4 rounded-sm bg-[#1C1917]" />
        </div>
      </div>

      <div className="px-4 pb-2 pt-2">
        <p className="text-sm font-bold text-[#1C1917]" style={{ fontFamily: "var(--font-jakarta)" }}>Horarios</p>
        <p className="text-[10px] text-[#8C8279]">Hoy, 15 de enero</p>
      </div>

      {/* Class cards */}
      <div className="flex-1 space-y-2 overflow-hidden px-3">
        {[
          { name: "Reformer Flow", time: "07:00 - 07:50", coach: "Laura M.", spots: "2 lugares", color: "#C9A96E", open: true },
          { name: "Pilates Mat", time: "09:00 - 09:50", coach: "Carlos R.", spots: "5 lugares", color: "#2D5016", open: true },
          { name: "Barre Sculpt", time: "10:30 - 11:20", coach: "Ana P.", spots: "Lleno", color: "#9F1239", open: false },
          { name: "Reformer Avanzado", time: "12:00 - 12:50", coach: "Laura M.", spots: "8 lugares", color: "#C9A96E", open: true },
          { name: "Yoga Flow", time: "17:00 - 17:50", coach: "Diana L.", spots: "3 lugares", color: "#1A2C4E", open: true },
          { name: "Power Pilates", time: "18:00 - 18:50", coach: "Carlos R.", spots: "1 lugar", color: "#2D5016", open: true },
        ].map((c) => (
          <div key={c.name + c.time} className="flex items-center gap-3 rounded-xl bg-white p-2.5 shadow-sm">
            <div className="h-9 w-1 rounded-full" style={{ backgroundColor: c.color }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-[#1C1917]">{c.name}</p>
              <p className="text-[8px] text-[#8C8279]">{c.time} · {c.coach}</p>
            </div>
            <div className="text-right">
              <p className={`text-[8px] font-medium ${c.open ? "text-emerald-600" : "text-red-500"}`}>{c.spots}</p>
              {c.open && (
                <div className="mt-0.5 rounded bg-[#C9A96E] px-2 py-0.5 text-center text-[7px] font-bold text-white">
                  Reservar
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-around border-t border-[#E8E2D9] px-2 py-2">
        {["Feed", "Clases", "Reservas", "Shop", "Perfil"].map((t, i) => (
          <div key={t} className="flex flex-col items-center gap-0.5">
            <div className={`h-4 w-4 rounded ${i === 1 ? "bg-[#C9A96E]" : "bg-[#8C8279]/30"}`} />
            <span className={`text-[7px] ${i === 1 ? "font-semibold text-[#C9A96E]" : "text-[#8C8279]"}`}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
