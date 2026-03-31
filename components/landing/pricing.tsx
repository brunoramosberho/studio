"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { FadeIn } from "./motion";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Starter",
    monthly: 299,
    annual: 249,
    onboarding: 799,
    platformFee: 1.5,
    popular: false,
    features: [
      "Hasta 200 miembros",
      "Reservas con mapa de spots",
      "Pagos y paquetes con Stripe",
      "Feed social y logros",
      "Push notifications",
    ],
  },
  {
    name: "Growth",
    monthly: 449,
    annual: 374,
    onboarding: 1499,
    platformFee: 1.0,
    popular: true,
    features: [
      "Hasta 600 miembros",
      "Todo de Starter +",
      "PWA white-label",
      "AI Assistant con insights",
      "Shop integrado",
      "Dashboard avanzado",
      "Coach portal",
      "1 deseo al mes",
      "Migración de datos incluida",
    ],
  },
  {
    name: "Scale",
    monthly: 699,
    annual: 499,
    onboarding: 0,
    platformFee: 0.5,
    popular: false,
    features: [
      "Miembros ilimitados",
      "Todo de Growth +",
      "Multi-sede",
      "Custom domain",
      "Account manager dedicado",
      "2 deseos al mes",
      "Onboarding incluido",
      "SLA de uptime",
    ],
  },
];

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="text-center">
          <p className="text-sm font-semibold tracking-tight text-orange-500">Precios</p>
          <h2
            className="mt-3 text-3xl font-semibold tracking-tighter text-gray-900 sm:text-4xl"
          >
            Precios simples. Sin sorpresas.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Todos los planes incluyen actualizaciones, hosting y soporte.
          </p>
        </FadeIn>

        {/* Toggle */}
        <FadeIn delay={0.1} className="mt-8 flex items-center justify-center gap-3">
          <span className={cn("text-sm font-medium", !annual ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500")}>
            Mensual
          </span>
          <button
            onClick={() => setAnnual(!annual)}
            className={cn(
              "relative inline-flex h-7 w-12 items-center rounded-full transition-colors",
              annual ? "bg-orange-500" : "bg-gray-200 dark:bg-gray-700",
            )}
          >
            <motion.span
              layout
              className="inline-block h-5 w-5 rounded-full bg-white shadow-sm"
              style={{ marginLeft: annual ? 26 : 2 }}
            />
          </button>
          <span className={cn("text-sm font-medium", annual ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500")}>
            Anual
          </span>
          {annual && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
            >
              2 meses gratis
            </motion.span>
          )}
        </FadeIn>

        {/* Cards */}
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {plans.map((plan, i) => (
            <FadeIn key={plan.name} delay={0.1 + i * 0.08}>
              <div
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6 transition-all",
                  plan.popular
                    ? "border-orange-200 bg-white shadow-xl ring-1 ring-orange-500/20 dark:border-orange-500/30 dark:bg-gray-900"
                    : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900",
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-4 py-1 text-xs font-bold text-white">
                    Más popular
                  </div>
                )}

                <p className="text-sm font-semibold text-gray-900 dark:text-white">{plan.name}</p>

                <div className="mt-4 flex items-baseline gap-1">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={annual ? "a" : "m"}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="text-4xl font-extrabold text-gray-900 dark:text-white"
                      
                    >
                      €{annual ? plan.annual : plan.monthly}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-sm text-gray-500 dark:text-gray-400">EUR/mes</span>
                </div>

                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  + {plan.platformFee}% platform fee por transacción
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {plan.onboarding > 0
                    ? `Onboarding: €${plan.onboarding.toLocaleString()} EUR (una vez)`
                    : "Onboarding incluido"}
                </p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href="mailto:hola@reserva.fit?subject=Demo%20reserva.fit"
                  className={cn(
                    "mt-6 flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-all",
                    plan.popular
                      ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                      : "border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800",
                  )}
                >
                  Agenda una demo
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Founding studio note */}
        <FadeIn delay={0.3} className="mt-12">
          <div className="mx-auto max-w-2xl rounded-2xl border border-orange-100 bg-orange-50/50 p-6 text-center dark:border-orange-500/20 dark:bg-orange-500/5">
            <Sparkles className="mx-auto h-5 w-5 text-orange-500" />
            <p className="mt-2 text-sm font-bold text-gray-900 dark:text-white">Founding Studio Program</p>
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">
              ¿Eres de los primeros estudios en unirse? Accede a pricing especial con lock de por vida.
              Incluye migración de datos gratuita y sesiones 1:1 de onboarding.
            </p>
            <a
              href="mailto:hola@reserva.fit?subject=Founding%20Studio%20Program"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 transition hover:text-orange-700 dark:text-orange-400"
            >
              Aplica aquí
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
