"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const brands = ["la de Peloton", "la de SoulCycle", "la de ClassPass", "la de Mindbody", "la de Barry's", "la de Equinox"];

const tabs = [
  {
    id: "social",
    label: "Feed Social",
    content: {
      phone: (
        <div className="space-y-3">
          <div className="text-center pt-2 pb-1">
            <p className="text-base font-bold text-foreground">Comunidad</p>
          </div>
          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-accent/20 overflow-hidden">
                <div className="w-full h-full bg-gradient-to-br from-accent/30 to-accent/10" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-foreground">Sara M.</p>
                <p className="text-[9px] text-muted-foreground">Acaba de terminar · Power HIIT</p>
              </div>
            </div>
            <div className="rounded-lg bg-surface p-2 flex items-center gap-3 text-[10px]">
              <div className="text-center">
                <p className="font-bold text-foreground">45m</p>
                <p className="text-muted-foreground">Duración</p>
              </div>
              <div className="h-6 w-px bg-border" />
              <div className="text-center">
                <p className="font-bold text-foreground">156</p>
                <p className="text-muted-foreground">FC prom.</p>
              </div>
              <div className="h-6 w-px bg-border" />
              <div className="text-center">
                <p className="font-bold text-foreground">420</p>
                <p className="text-muted-foreground">Calorías</p>
              </div>
            </div>
            <p className="text-[10px] text-foreground">La mejor sesión de la semana 💪</p>
            <div className="flex gap-3 text-[9px] text-muted">
              <span>🔥 12 kudos</span>
              <span>💬 3 comentarios</span>
            </div>
          </div>
          <div className="rounded-xl border border-violet/20 bg-violet/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-violet/20 overflow-hidden">
                <div className="w-full h-full bg-gradient-to-br from-violet/30 to-violet/10" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-foreground">
                  Jake R. <span className="font-normal text-muted">ganó un badge</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white border border-violet/20 p-2">
              <div className="h-9 w-9 rounded-full bg-violet flex items-center justify-center text-white text-sm">★</div>
              <div>
                <p className="text-[10px] font-bold text-violet">Century Club</p>
                <p className="text-[8px] text-muted-foreground">¡100 clases completadas!</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-3">
            <p className="text-[10px] text-foreground">
              <strong>Emma W.</strong> acaba de reservar <strong>Yoga Flow</strong> — Mañana 8 AM
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">2 amigas van a ir</p>
            <button className="mt-2 rounded-full bg-accent/10 px-3 py-1 text-[9px] font-semibold text-accent">
              Unirme a esta clase →
            </button>
          </div>
        </div>
      ),
      floater: (
        <div className="rounded-xl bg-white border border-border shadow-lg p-3 w-48">
          <p className="text-[10px] font-semibold text-foreground mb-2">Amigas esta semana</p>
          <div className="space-y-2">
            {[
              { name: "Emma W.", classes: 5, streak: "🔥 12" },
              { name: "Jake R.", classes: 4, streak: "🔥 8" },
              { name: "Mia T.", classes: 3, streak: "🔥 15" },
            ].map((f) => (
              <div key={f.name} className="flex items-center justify-between text-[9px]">
                <span className="font-medium text-foreground">{f.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{f.classes} clases</span>
                  <span>{f.streak}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  },
  {
    id: "achievements",
    label: "Logros",
    content: {
      phone: (
        <div className="space-y-3">
          <div className="text-center pt-2 pb-1">
            <p className="text-base font-bold text-foreground">Logros</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-violet/10 to-accent/5 border border-violet/20 p-4 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-violet flex items-center justify-center text-white text-2xl mb-2">★</div>
            <p className="text-sm font-bold text-violet">Nivel 3 — Comprometido</p>
            <p className="text-[10px] text-muted-foreground mt-1">4 clases más para el Nivel 4</p>
            <div className="mt-3 h-2 rounded-full bg-violet/10 overflow-hidden">
              <div className="h-full w-3/4 rounded-full bg-violet" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: "🔥", name: "Fire Starter", desc: "10 clases", unlocked: true },
              { icon: "⚡", name: "Guerrera", desc: "25 clases", unlocked: true },
              { icon: "💎", name: "Century", desc: "100 clases", unlocked: false },
              { icon: "🌅", name: "Madrugadora", desc: "20 clases AM", unlocked: true },
              { icon: "🎯", name: "Constante", desc: "4 sem seguidas", unlocked: true },
              { icon: "👥", name: "Social", desc: "10 amigas", unlocked: false },
            ].map((b) => (
              <div
                key={b.name}
                className={`rounded-xl p-2 text-center ${
                  b.unlocked ? "bg-white border border-border" : "bg-surface/50 opacity-40"
                }`}
              >
                <span className="text-lg">{b.icon}</span>
                <p className="text-[8px] font-semibold text-foreground mt-1">{b.name}</p>
                <p className="text-[7px] text-muted-foreground">{b.desc}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
            <p className="text-[10px] font-semibold text-accent mb-1">🎁 ¡Recompensa desbloqueada!</p>
            <p className="text-[9px] text-foreground">Clase gratis por alcanzar el Nivel 3</p>
          </div>
        </div>
      ),
      floater: (
        <div className="rounded-xl bg-white border border-violet/20 shadow-lg p-3 w-44">
          <p className="text-[10px] font-semibold text-violet mb-1">🎉 ¡Nuevo Badge!</p>
          <p className="text-[9px] text-foreground">Desbloqueaste <strong>Madrugadora</strong></p>
          <p className="text-[8px] text-muted-foreground mt-1">Completaste 20 clases matutinas</p>
        </div>
      ),
    },
  },
  {
    id: "booking",
    label: "Reservar y Elegir Lugar",
    content: {
      phone: (
        <div className="space-y-3">
          <div className="text-center pt-2 pb-1">
            <p className="text-base font-bold text-foreground">Power HIIT</p>
            <p className="text-[10px] text-muted-foreground">Mañana, 7:00 AM · Coach María</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-[10px] font-semibold text-foreground mb-2 text-center">Elige tu lugar</p>
            <div className="text-center mb-2">
              <div className="inline-block rounded-md bg-foreground px-6 py-0.5 text-[8px] text-white font-medium">COACH</div>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 20 }).map((_, i) => {
                const taken = [2, 5, 7, 11, 14, 16].includes(i);
                const selected = i === 8;
                return (
                  <div
                    key={i}
                    className={`h-7 rounded-md flex items-center justify-center text-[8px] font-medium ${
                      selected
                        ? "bg-accent text-white"
                        : taken
                        ? "bg-foreground/10 text-muted-foreground"
                        : "bg-surface border border-border text-foreground hover:border-accent"
                    }`}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-4 mt-2 text-[8px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-surface border border-border" /> Disponible
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-accent" /> Seleccionado
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-foreground/10" /> Ocupado
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-surface p-3 space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Lugares disponibles</span>
              <span className="font-semibold text-foreground">6 / 20</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Usando</span>
              <span className="font-semibold text-foreground">1 crédito</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Amigas que van</span>
              <span className="font-semibold text-foreground">Emma, Jake</span>
            </div>
          </div>
          <button className="w-full rounded-xl bg-accent text-white text-xs font-semibold py-3">
            Confirmar Reserva — Lugar #9
          </button>
        </div>
      ),
      floater: (
        <div className="rounded-xl bg-white border border-border shadow-lg p-3 w-44">
          <p className="text-[10px] font-semibold text-foreground">🎵 Pedir Canción</p>
          <p className="text-[9px] text-muted-foreground mt-1">Pide una canción para la clase</p>
          <div className="mt-2 rounded-md bg-surface border border-border px-2 py-1.5 text-[9px] text-muted-foreground">
            Buscar canciones...
          </div>
        </div>
      ),
    },
  },
  {
    id: "referrals",
    label: "Refiere y Gana",
    content: {
      phone: (
        <div className="space-y-3">
          <div className="text-center pt-2 pb-1">
            <p className="text-base font-bold text-foreground">Refiere y Gana</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 p-4 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">Tu código de referido</p>
            <p className="text-xl font-extrabold text-accent tracking-wider">SARA2024</p>
            <button className="mt-2 rounded-full bg-accent px-4 py-1.5 text-[10px] font-semibold text-white">
              Compartir enlace →
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "8", l: "Referidas" },
              { v: "5", l: "Convertidas" },
              { v: "3", l: "Recompensas" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-surface p-2 text-center">
                <p className="text-lg font-bold text-foreground">{s.v}</p>
                <p className="text-[8px] text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-foreground">Tus referidas</p>
            {[
              { name: "María L.", status: "Reservó primera clase", stage: "🟢" },
              { name: "Tom K.", status: "Instaló la app", stage: "🟡" },
              { name: "Ana S.", status: "Recompensa pendiente", stage: "🎁" },
            ].map((r) => (
              <div key={r.name} className="flex items-center justify-between rounded-lg bg-surface p-2 text-[10px]">
                <span className="font-medium text-foreground">{r.name}</span>
                <span className="text-muted-foreground">{r.stage} {r.status}</span>
              </div>
            ))}
          </div>
        </div>
      ),
      floater: (
        <div className="rounded-xl bg-white border border-accent/20 shadow-lg p-3 w-44">
          <p className="text-[10px] font-semibold text-accent">🎁 ¡Recompensa lista!</p>
          <p className="text-[9px] text-foreground mt-1">¡Ana se registró! Ganaste una clase gratis.</p>
        </div>
      ),
    },
  },
];

export function MemberApp() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const [brandIndex, setBrandIndex] = useState(0);
  const active = tabs.find((t) => t.id === activeTab)!;

  useEffect(() => {
    const interval = setInterval(() => {
      setBrandIndex((prev) => (prev + 1) % brands.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="member-app" className="py-20 md:py-28 bg-surface/50 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center mb-6"
        >
          <div className="inline-flex items-center rounded-full border border-border bg-white px-4 py-1.5 text-sm font-medium text-muted mb-6">
            App de Miembros
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
            La app de tu studio.{" "}
            <span className="block sm:inline">
              Mejor que{" "}
              <span className="inline-block relative overflow-hidden align-bottom py-1" style={{ height: "1.2em" }}>
                <AnimatePresence mode="wait">
                  <motion.em
                    key={brands[brandIndex]}
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={{ y: "-100%", opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="not-italic text-gradient block"
                  >
                    {brands[brandIndex]}
                  </motion.em>
                </AnimatePresence>
              </span>
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-xl mx-auto">
            Una PWA con tu marca que tus miembros sí van a amar — reservas, social, logros
            y comunidad, sin pasar por la App Store.
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-2 sm:gap-6 mb-10">
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
            <div className="relative rounded-3xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-surface via-accent/5 to-surface" />

              <div className="relative flex items-center justify-center py-12 md:py-16 px-4">
                <div className="relative w-[280px] shrink-0">
                  <div className="rounded-[2.5rem] border-[6px] border-foreground/90 bg-white shadow-2xl overflow-hidden">
                    <div className="mx-auto mt-2 h-5 w-28 rounded-full bg-foreground/90" />
                    <div className="px-4 pt-3 pb-6">
                      {active.content.phone}
                    </div>
                  </div>
                  <div className="absolute -inset-6 -z-10 rounded-[3.5rem] bg-accent/8 blur-3xl" />

                  <motion.div
                    initial={{ opacity: 0, x: 30, y: 10 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="absolute -right-4 sm:-right-24 bottom-12 sm:bottom-20 z-10"
                  >
                    {active.content.floater}
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-8"
        >
          <p className="text-sm font-semibold text-foreground mb-2">
            Prueba la App de Miembros de Mgic ahora
          </p>
          <p className="text-xs text-muted">
            Progressive Web App — funciona en cualquier dispositivo, sin descargas
          </p>
        </motion.div>
      </div>
    </section>
  );
}
