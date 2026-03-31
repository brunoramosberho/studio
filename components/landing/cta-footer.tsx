"use client";

import { ArrowRight } from "lucide-react";
import { FadeIn } from "./motion";

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-gray-900 py-24">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[600px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(249,115,22,0.15) 0%, transparent 70%)",
        }}
      />

      <svg
        className="absolute inset-0 size-full opacity-20"
        style={{
          maskImage: "radial-gradient(white 30%, transparent 70%)",
        }}
      >
        <defs>
          <pattern
            id="cta-diagonal"
            patternUnits="userSpaceOnUse"
            width="64"
            height="64"
          >
            {Array.from({ length: 17 }, (_, i) => {
              const offset = i * 8;
              return (
                <path
                  key={i}
                  d={`M${-106 + offset} 110L${22 + offset} -18`}
                  className="stroke-gray-700"
                  strokeWidth="1"
                />
              );
            })}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cta-diagonal)" />
      </svg>

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <FadeIn>
          <h2 className="text-3xl font-semibold tracking-tighter text-white sm:text-5xl">
            Tu estudio merece
            <br />
            su propia plataforma.
          </h2>
          <p className="mt-5 text-lg text-gray-400">
            Deja de depender de apps genéricas. Lanza tu experiencia digital con
            tu marca en semanas, no meses.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:hola@reserva.fit?subject=Demo%20reserva.fit"
              className="group relative inline-flex items-center gap-2 rounded-md border-b-[1.5px] border-orange-700 bg-gradient-to-b from-orange-400 to-orange-500 px-7 py-3.5 text-sm font-bold text-white shadow-[0_0_0_2px_rgba(0,0,0,0.04),0_0_14px_0_rgba(255,255,255,0.19)] transition-all duration-200 hover:shadow-orange-300"
            >
              Agenda una demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="mailto:hola@reserva.fit?subject=Más%20información"
              className="inline-flex items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-7 py-3.5 text-sm font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white"
            >
              Hablar con ventas
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <div className="px-4 xl:px-0">
      <footer className="relative mx-auto flex max-w-6xl flex-wrap pt-4">
        <svg
          className="mb-10 h-20 w-full border-y border-dashed border-gray-300 stroke-gray-300"
        >
          <defs>
            <pattern
              id="diagonal-footer-pattern"
              patternUnits="userSpaceOnUse"
              width="64"
              height="64"
            >
              {Array.from({ length: 17 }, (_, i) => {
                const offset = i * 8;
                return (
                  <path
                    key={i}
                    d={`M${-106 + offset} 110L${22 + offset} -18`}
                    stroke=""
                    strokeWidth="1"
                  />
                );
              })}
            </pattern>
          </defs>
          <rect
            stroke="none"
            width="100%"
            height="100%"
            fill="url(#diagonal-footer-pattern)"
          />
        </svg>

        <div className="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="text-sm font-bold tracking-tight text-gray-900">
            reserva<span className="text-orange-500">.fit</span>
          </span>
          <div className="flex gap-6">
            <a
              href="mailto:hola@reserva.fit"
              className="text-sm text-gray-600 transition-colors duration-200 hover:text-gray-900"
            >
              Contacto
            </a>
            <a
              href="#pricing"
              className="text-sm text-gray-600 transition-colors duration-200 hover:text-gray-900"
            >
              Precios
            </a>
          </div>
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} reserva.fit. Todos los derechos
            reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
