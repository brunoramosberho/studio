"use client";

import { Check, X, Minus } from "lucide-react";
import { FadeIn } from "./motion";
import { cn } from "@/lib/utils";

const rows = [
  { feature: "Reservas con mapa de spots", reserva: true, momence: true, mariana: true },
  { feature: "Feed social / comunidad", reserva: true, momence: false, mariana: false },
  { feature: "AI assistant con insights", reserva: true, momence: false, mariana: false },
  { feature: "PWA white-label", reserva: true, momence: "partial", mariana: true },
  { feature: "Shop integrado (Shopify + interno)", reserva: true, momence: "partial", mariana: false },
  { feature: "Branding completo (colores, tipografía, logo)", reserva: true, momence: "partial", mariana: true },
  { feature: "Coach portal dedicado", reserva: true, momence: true, mariana: true },
  { feature: "Gamificación y logros", reserva: true, momence: false, mariana: false },
  { feature: "Push notifications nativas", reserva: true, momence: true, mariana: true },
  { feature: "Multi-sede", reserva: true, momence: true, mariana: true },
  { feature: "Onboarding personalizado en español", reserva: true, momence: false, mariana: false },
  { feature: "Precio desde", reserva: "€299/m", momence: "$129/m", mariana: "Custom" },
];

function CellIcon({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="h-4 w-4 text-emerald-500" />;
  if (value === false) return <X className="h-4 w-4 text-gray-300 dark:text-gray-600" />;
  if (value === "partial") return <Minus className="h-4 w-4 text-amber-400" />;
  return <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{value}</span>;
}

export function Comparison() {
  return (
    <section className="bg-gray-50 py-24 dark:bg-gray-900/50">
      <div className="mx-auto max-w-4xl px-6">
        <FadeIn className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Comparación</p>
          <h2
            className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl dark:text-white"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            ¿Por qué reserva.fit?
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Más features, mejor precio, soporte en tu idioma.
          </p>
        </FadeIn>

        <FadeIn delay={0.1} className="mt-12">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Feature</th>
                    <th className="px-4 py-3.5 text-center">
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                        reserva.fit
                      </span>
                    </th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Momence</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Mariana&nbsp;Tek</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={cn(
                        "border-b border-gray-50 dark:border-gray-800/50",
                        i % 2 === 0 && "bg-gray-50/50 dark:bg-gray-800/20",
                      )}
                    >
                      <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">{row.feature}</td>
                      <td className="px-4 py-3 text-center"><div className="flex justify-center"><CellIcon value={row.reserva} /></div></td>
                      <td className="px-4 py-3 text-center"><div className="flex justify-center"><CellIcon value={row.momence} /></div></td>
                      <td className="px-4 py-3 text-center"><div className="flex justify-center"><CellIcon value={row.mariana} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
