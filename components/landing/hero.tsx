"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { IPhoneFrame } from "./mockups";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
      {/* Gradient beam */}
      <motion.div
        initial={{ opacity: 0, x: "-60%", y: "-40%" }}
        animate={{ opacity: 1, x: "-50%", y: "-50%" }}
        transition={{ duration: 1.8, ease: "easeOut" }}
        className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "conic-gradient(from 230deg at 50% 50%, #6366f1 0deg, #a855f7 60deg, #ec4899 120deg, #6366f1 360deg)",
          filter: "blur(120px)",
          opacity: 0.15,
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-indigo-50/80 px-4 py-1.5 text-xs font-semibold text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400"
            >
              <Sparkles className="h-3.5 w-3.5" />
              La plataforma todo-en-uno para estudios fitness
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl dark:text-white"
              style={{ fontFamily: "var(--font-jakarta), sans-serif" }}
            >
              Tu estudio.
              <br />
              <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Tu marca.
              </span>
              <br />
              Tu plataforma.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="mt-6 max-w-lg text-lg leading-relaxed text-gray-500 dark:text-gray-400"
              style={{ fontFamily: "var(--font-dmsans), sans-serif" }}
            >
              Reservas, pagos, comunidad social, analytics con IA y
              una app white-label para tus miembros — todo en un
              solo lugar.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-8 flex flex-wrap gap-4"
            >
              <a
                href="#pricing"
                className="group relative inline-flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                {/* Glow pulse */}
                <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-indigo-500/20 blur-xl" />
                Agenda una demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
              >
                Ver producto
              </a>
            </motion.div>
          </div>

          {/* iPhone mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
            className="flex justify-center lg:justify-end"
          >
            <motion.div
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            >
              <IPhoneFrame>
                <FeedMockup />
              </IPhoneFrame>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FeedMockup() {
  return (
    <div className="flex h-full flex-col bg-[#FAF9F6]">
      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <span className="text-xs font-semibold text-[#1C1917]">9:41</span>
        <div className="flex gap-1">
          <div className="h-2.5 w-4 rounded-sm bg-[#1C1917]" />
          <div className="h-2.5 w-2.5 rounded-full border border-[#1C1917]" />
        </div>
      </div>

      {/* Header */}
      <div className="px-4 pb-3 pt-1">
        <p className="text-[10px] text-[#8C8279]">Bienvenida de vuelta</p>
        <p className="text-sm font-bold text-[#1C1917]" style={{ fontFamily: "var(--font-jakarta)" }}>María García</p>
      </div>

      {/* Feed cards */}
      <div className="flex-1 space-y-2.5 overflow-hidden px-3">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#C9A96E] to-[#A67C3D]" />
            <div>
              <p className="text-[10px] font-semibold text-[#1C1917]">BE TORO Studio</p>
              <p className="text-[8px] text-[#8C8279]">Hace 2h</p>
            </div>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-[#1C1917]">
            Nuevas clases de Reformer Avanzado disponibles esta semana. ¡Reserva tu lugar!
          </p>
          <div className="mt-2 flex gap-3">
            <span className="text-[8px] text-[#8C8279]">❤️ 24</span>
            <span className="text-[8px] text-[#8C8279]">💬 8</span>
          </div>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-pink-200" />
            <div>
              <p className="text-[10px] font-semibold text-[#1C1917]">Ana López</p>
              <p className="text-[8px] text-[#8C8279]">Completó Reformer Sculpt</p>
            </div>
          </div>
          <p className="mt-2 text-[9px] text-[#1C1917]">
            ¡Clase increíble! 🔥 Mi tercera de la semana
          </p>
          <div className="mt-2 flex gap-2">
            <span className="rounded-full bg-[#C9A96E]/10 px-2 py-0.5 text-[8px] font-medium text-[#C9A96E]">
              🏆 Racha de 3 días
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-[#C9A96E] to-[#A67C3D] p-3 shadow-sm">
          <p className="text-[10px] font-bold text-white">Tu próxima clase</p>
          <p className="mt-1 text-[9px] text-white/80">Reformer Flow · Hoy 18:00</p>
          <p className="text-[9px] text-white/60">Sala A · Lugar 4</p>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="mt-auto flex items-center justify-around border-t border-[#E8E2D9] px-2 py-2">
        {["Feed", "Clases", "Reservas", "Shop", "Perfil"].map((t, i) => (
          <div key={t} className="flex flex-col items-center gap-0.5">
            <div className={`h-4 w-4 rounded ${i === 0 ? "bg-[#C9A96E]" : "bg-[#8C8279]/30"}`} />
            <span className={`text-[7px] ${i === 0 ? "font-semibold text-[#C9A96E]" : "text-[#8C8279]"}`}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
