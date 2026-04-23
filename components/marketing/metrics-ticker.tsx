"use client";

import { motion } from "framer-motion";

const metrics = [
  { value: "10+", label: "Herramientas que reemplaza" },
  { value: "<30 min", label: "Tiempo de configuración" },
  { value: "24/7", label: "Asistente con IA" },
  { value: "Mes a mes", label: "Sin contratos" },
  { value: "Stripe", label: "Pagos seguros" },
  { value: "PWA", label: "Sin App Store" },
  { value: "Multi-studio", label: "Una sola plataforma" },
  { value: "ES · EN", label: "Multi-idioma" },
];

export function MetricsTicker() {
  const doubled = [...metrics, ...metrics];

  return (
    <section className="relative py-8 border-y border-border bg-surface/50 overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="animate-ticker flex w-max gap-12 px-6">
          {doubled.map((m, i) => (
            <div key={i} className="flex items-center gap-3 whitespace-nowrap">
              <span className="text-2xl font-extrabold text-foreground">{m.value}</span>
              <span className="text-sm font-medium text-muted">{m.label}</span>
              {i < doubled.length - 1 && <span className="ml-6 h-4 w-px bg-border" />}
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
