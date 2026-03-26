"use client";

import { ArrowRight } from "lucide-react";
import { FadeIn } from "./motion";

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-gray-900 py-24 dark:bg-gray-950">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[600px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <FadeIn>
          <h2
            className="text-3xl font-extrabold text-white sm:text-5xl"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Tu estudio merece
            <br />
            su propia plataforma.
          </h2>
          <p className="mt-5 text-lg text-gray-400">
            Deja de depender de apps genéricas. Lanza tu experiencia digital con tu marca en semanas, no meses.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:hola@reserva.fit?subject=Demo%20reserva.fit"
              className="group relative inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-gray-900 transition hover:bg-gray-100"
            >
              <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-indigo-500/20 blur-xl" />
              Agenda una demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="mailto:hola@reserva.fit?subject=Más%20información"
              className="inline-flex items-center gap-2 rounded-full border border-gray-700 px-7 py-3.5 text-sm font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white"
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
    <footer className="border-t border-gray-100 bg-white py-10 dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <span className="text-sm font-bold tracking-tight text-gray-900 dark:text-white" style={{ fontFamily: "var(--font-jakarta)" }}>
          reserva<span className="text-indigo-500">.fit</span>
        </span>
        <div className="flex gap-6">
          <a href="mailto:hola@reserva.fit" className="text-sm text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
            Contacto
          </a>
          <a href="#pricing" className="text-sm text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
            Precios
          </a>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          © {new Date().getFullYear()} reserva.fit. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
