"use client";

import { motion } from "framer-motion";

export function DarkCTA() {
  return (
    <section id="cta" className="py-20 md:py-28 bg-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground to-accent/20 pointer-events-none" />

      <div className="relative mx-auto max-w-4xl px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            ¿Listo para operar tu studio <em className="not-italic text-gradient">como magia?</em>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/60">
            Arranca tu prueba gratis hoy — sin tarjeta de crédito, sin compromiso.
            Te ayudamos a montar tu studio en Mgic en minutos.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="mailto:hola@mgic.app?subject=Quiero%20probar%20Mgic"
              className="btn-gradient inline-flex h-12 items-center rounded-full px-8 text-base font-semibold shadow-lg shadow-accent/25"
            >
              Empezar Prueba Gratis
            </a>
            <a
              href="mailto:hola@mgic.app?subject=Reservar%20Demo%20Mgic"
              className="inline-flex h-12 items-center rounded-full border border-white/20 px-8 text-base font-semibold text-white transition-all hover:bg-white/10 hover:-translate-y-0.5"
            >
              Reservar una Demo
            </a>
          </div>

          <p className="mt-6 text-sm text-white/40">
            Prueba de 14 días · Sin tarjeta de crédito · Cancela cuando quieras
          </p>
        </motion.div>
      </div>
    </section>
  );
}
