"use client";

import { motion } from "framer-motion";

const metrics = [
  { value: "200+", label: "Studios Worldwide" },
  { value: "50K+", label: "Classes Booked Monthly" },
  { value: "99.9%", label: "Uptime" },
  { value: "4.9/5", label: "Average Rating" },
  { value: "30%", label: "Revenue Growth Avg" },
  { value: "12K+", label: "Active Members" },
  { value: "<2 min", label: "Avg Setup Time" },
  { value: "85%", label: "Retention Rate Lift" },
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
