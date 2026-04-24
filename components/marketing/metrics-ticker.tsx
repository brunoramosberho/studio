"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function MetricsTicker() {
  const t = useTranslations("marketing");
  const metrics = t.raw("metricsTicker") as { value: string; label: string }[];
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
