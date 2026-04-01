"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Minus } from "lucide-react";
import { FadeIn } from "./motion";
import { cn } from "@/lib/utils";

type CellValue = true | false | { partial: true; note: string } | { price: string; highlight?: boolean; asterisk?: boolean };

interface Row {
  feature: string;
  reserva: CellValue;
  momence: CellValue;
  bsport: CellValue;
  mariana: CellValue;
  isPriceRow?: boolean;
}

const rows: Row[] = [
  {
    feature: "Reservas con mapa de spots",
    reserva: true,
    momence: true,
    bsport: true,
    mariana: true,
  },
  {
    feature: "Feed social y comunidad",
    reserva: true,
    momence: false,
    bsport: false,
    mariana: false,
  },
  {
    feature: "AI assistant con insights",
    reserva: true,
    momence: { partial: true, note: "$399/mes" },
    bsport: false,
    mariana: false,
  },
  {
    feature: "Gamificación y logros",
    reserva: true,
    momence: false,
    bsport: false,
    mariana: false,
  },
  {
    feature: "PWA white-label",
    reserva: true,
    momence: { partial: true, note: "parcial" },
    bsport: { partial: true, note: "solo Premium+" },
    mariana: true,
  },
  {
    feature: "Shop integrado",
    reserva: true,
    momence: { partial: true, note: "retail básico" },
    bsport: true,
    mariana: false,
  },
  {
    feature: "Branding completo",
    reserva: true,
    momence: { partial: true, note: "parcial" },
    bsport: { partial: true, note: "parcial" },
    mariana: true,
  },
  {
    feature: "Coach portal dedicado",
    reserva: true,
    momence: true,
    bsport: true,
    mariana: true,
  },
  {
    feature: "Email + SMS marketing",
    reserva: true,
    momence: { partial: true, note: "$160/mes" },
    bsport: true,
    mariana: false,
  },
  {
    feature: "Desarrollo personalizado incluido",
    reserva: true,
    momence: false,
    bsport: false,
    mariana: false,
  },
  {
    feature: "Multi-sede",
    reserva: true,
    momence: true,
    bsport: true,
    mariana: true,
  },
  {
    feature: "Sin contrato anual",
    reserva: true,
    momence: true,
    bsport: { partial: true, note: "12 meses mín." },
    mariana: false,
  },
  {
    feature: "Account manager LATAM + España",
    reserva: true,
    momence: false,
    bsport: { partial: true, note: "parcial" },
    mariana: false,
  },
  {
    feature: "Precio real (features equivalentes)",
    reserva: { price: "€449/mes", highlight: true },
    momence: { price: "~$500/mes", asterisk: true },
    bsport: { price: "~€350/mes", asterisk: true },
    mariana: { price: "Custom" },
    isPriceRow: true,
  },
];

const footnoteText =
  "* Momence: $199 base + $160 email/SMS + $29 teacher substitutions + $49 referrals ≈ $437/mes sin AI. Con AI Inbox: $836/mes. * bsport: precio estimado plan Premium+ (no publicado). Comparativa basada en features equivalentes al plan Growth de reserva.fit.";

function CellContent({ value }: { value: CellValue }) {
  if (value === true) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      </div>
    );
  }

  if (value === false) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
        <X className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
      </div>
    );
  }

  if ("partial" in value) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/15">
          <Minus className="h-3.5 w-3.5 text-amber-500" />
        </div>
        <span className="text-[10px] leading-tight text-gray-400 dark:text-gray-500">
          {value.note}
        </span>
      </div>
    );
  }

  if ("price" in value) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span
          className={cn(
            "text-[13px] font-bold",
            value.highlight
              ? "text-orange-600 dark:text-orange-400"
              : "text-gray-600 dark:text-gray-300",
          )}
        >
          {value.price}
          {value.asterisk && <AsteriskTooltip />}
        </span>
      </div>
    );
  }

  return null;
}

function AsteriskTooltip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="ml-0.5 cursor-pointer text-[11px] text-gray-400 transition hover:text-gray-600"
      >
        *
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[11px] leading-relaxed text-gray-500 shadow-xl dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
          >
            {footnoteText}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white dark:border-t-gray-800" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Comparison() {
  return (
    <section className="bg-gray-50 py-24 dark:bg-gray-900/50">
      <div className="mx-auto max-w-5xl px-6">
        <FadeIn className="text-center">
          <p className="text-sm font-semibold tracking-tight text-orange-500">Comparación</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tighter text-gray-900 sm:text-4xl">
            ¿Por qué reserva.fit?
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Más features, mejor precio, soporte en tu idioma.
          </p>
        </FadeIn>

        <FadeIn delay={0.1} className="mt-12">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg shadow-gray-200/30 dark:border-gray-700 dark:bg-gray-900 dark:shadow-none">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Feature
                    </th>
                    <th className="bg-orange-50/50 px-4 py-4 text-center dark:bg-orange-500/5">
                      <span className="rounded-full bg-orange-500 px-3.5 py-1 text-[11px] font-bold text-white">
                        reserva.fit
                      </span>
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Momence
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
                      bsport
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Mariana&nbsp;Tek
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={cn(
                        "border-b transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/20",
                        row.isPriceRow
                          ? "border-t-2 border-t-gray-200 border-b-0 dark:border-t-gray-700"
                          : "border-gray-50 dark:border-gray-800/50",
                        !row.isPriceRow && i % 2 === 0 && "bg-gray-50/40 dark:bg-gray-800/10",
                      )}
                    >
                      <td
                        className={cn(
                          "px-5 py-3.5 text-[13px]",
                          row.isPriceRow
                            ? "font-semibold text-gray-900 dark:text-white"
                            : "text-gray-700 dark:text-gray-300",
                        )}
                      >
                        {row.feature}
                      </td>
                      <td className="bg-orange-50/30 px-4 py-3.5 text-center dark:bg-orange-500/[0.03]">
                        <div className="flex justify-center">
                          <CellContent value={row.reserva} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex justify-center">
                          <CellContent value={row.momence} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex justify-center">
                          <CellContent value={row.bsport} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex justify-center">
                          <CellContent value={row.mariana} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footnote */}
          <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
            * Momence: $199 base + $160 email/SMS + $29 teacher substitutions + $49 referrals ≈
            $437/mes sin AI. Con AI Inbox: $836/mes.
            <br />
            * bsport: precio estimado plan Premium+ (no publicado). Comparativa basada en features
            equivalentes al plan Growth de reserva.fit.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
