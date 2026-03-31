"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { FadeIn } from "./motion";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "¿Mis clientes necesitan descargar una app?",
    a: "No. reserva.fit es una PWA (Progressive Web App) que se instala desde el navegador como una app nativa. No hay App Store de por medio — tus clientes la agregan a su Home Screen en segundos con tu marca, tu icono y tus colores.",
  },
  {
    q: "¿Puedo migrar mis datos de otra plataforma?",
    a: "Sí. En los planes Growth y Scale incluimos migración de datos. Importamos clientes, paquetes, historial de clases y coaches desde Momence, Mindbody, Mariana Tek, Google Sheets u otras plataformas.",
  },
  {
    q: "¿Cuánto tarda el onboarding?",
    a: "El setup técnico toma 48 horas. El onboarding completo con branding, clases, coaches y paquetes suele estar listo en 1-2 semanas, dependiendo de la complejidad de tu estudio.",
  },
  {
    q: "¿Qué métodos de pago soportan?",
    a: "Usamos Stripe como procesador de pagos, lo que te da acceso a tarjetas de crédito/débito, Apple Pay, Google Pay y más. Stripe maneja la regulación y la seguridad — tú solo recibes tu dinero.",
  },
  {
    q: "¿El AI assistant está incluido en todos los planes?",
    a: "El AI assistant está disponible en los planes Growth y Scale. En Starter tienes acceso al dashboard con métricas básicas. El AI agrega análisis predictivo, detección de clientes en riesgo y sugerencias automatizadas.",
  },
  {
    q: "¿Puedo usar mi propio dominio?",
    a: "Sí. En el plan Scale puedes usar tu propio dominio (ej: app.tuestudio.com). En Starter y Growth, tu estudio vive en tuestudio.reserva.fit con tu branding completo.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24">
      <div className="mx-auto max-w-3xl px-6">
        <FadeIn className="text-center">
          <p className="text-sm font-semibold tracking-tight text-orange-500">FAQ</p>
          <h2
            className="mt-3 text-3xl font-semibold tracking-tighter text-gray-900 sm:text-4xl"
          >
            Preguntas frecuentes
          </h2>
        </FadeIn>

        <FadeIn delay={0.1} className="mt-12 space-y-2">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className="rounded-xl border border-gray-100 bg-white transition-all dark:border-gray-800 dark:bg-gray-900"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <span className="pr-4 text-sm font-semibold text-gray-900 dark:text-white">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-gray-400 transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </FadeIn>
      </div>
    </section>
  );
}
