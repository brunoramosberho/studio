"use client";

import { motion } from "framer-motion";
import {
  CalendarCheck,
  CreditCard,
  Users,
  BarChart3,
  Smartphone,
  Palette,
  ShoppingBag,
  Trophy,
  MessageCircle,
  Bot,
  Zap,
  Globe,
} from "lucide-react";
import { FadeIn, Stagger, staggerChild } from "./motion";

const features = [
  {
    icon: CalendarCheck,
    title: "Reservas inteligentes",
    description: "Sistema de reservas con mapa de spots, lista de espera automática y recordatorios push.",
    color: "text-indigo-500",
    bg: "bg-indigo-50 dark:bg-indigo-500/10",
  },
  {
    icon: CreditCard,
    title: "Pagos y paquetes",
    description: "Paquetes de clases, ofertas y suscripciones con Stripe. Facturación automática.",
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  {
    icon: Users,
    title: "Feed social",
    description: "Comunidad dentro de tu app — logros, rankings de asistencia y posts del estudio.",
    color: "text-pink-500",
    bg: "bg-pink-50 dark:bg-pink-500/10",
  },
  {
    icon: BarChart3,
    title: "Dashboard avanzado",
    description: "Métricas en tiempo real, alertas de ocupación, revenue, retención y tendencias.",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    icon: Bot,
    title: "AI Assistant",
    description: "Análisis predictivo, sugerencias de reactivación de clientes y reportes automatizados.",
    color: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-500/10",
  },
  {
    icon: Smartphone,
    title: "PWA white-label",
    description: "Tu propia app con tu marca, colores y dominio. Se instala como app nativa desde el navegador.",
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-500/10",
  },
  {
    icon: Palette,
    title: "Branding total",
    description: "Logo, colores, tipografías y app icon — todo configurable desde el admin.",
    color: "text-rose-500",
    bg: "bg-rose-50 dark:bg-rose-500/10",
  },
  {
    icon: ShoppingBag,
    title: "Shop integrado",
    description: "Vende merch, bebidas y más desde la app. Integra con Shopify o vende directo.",
    color: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-500/10",
  },
  {
    icon: Trophy,
    title: "Logros y gamificación",
    description: "Rachas, medallas y leaderboards que mantienen a tus miembros motivados.",
    color: "text-yellow-500",
    bg: "bg-yellow-50 dark:bg-yellow-500/10",
  },
  {
    icon: MessageCircle,
    title: "Push notifications",
    description: "Recordatorios de clase, posts del estudio y notificaciones de amigos.",
    color: "text-cyan-500",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
  },
  {
    icon: Zap,
    title: "Coach portal",
    description: "Vista dedicada para coaches con su schedule, asistentes y estadísticas.",
    color: "text-lime-500",
    bg: "bg-lime-50 dark:bg-lime-500/10",
  },
  {
    icon: Globe,
    title: "Multi-sede",
    description: "Gestiona múltiples estudios y ciudades desde una sola plataforma.",
    color: "text-teal-500",
    bg: "bg-teal-50 dark:bg-teal-500/10",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Producto</p>
          <h2
            className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl dark:text-white"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Todo lo que necesitas.
            <br />
            Nada que sobre.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Cada feature diseñado para estudios de fitness — pilates, yoga, barre, cycling, functional y más.
          </p>
        </FadeIn>

        <Stagger className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" staggerDelay={0.06}>
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={staggerChild}
              className="group rounded-2xl border border-gray-100 bg-white p-6 transition-all hover:shadow-lg dark:border-gray-800 dark:bg-gray-900"
            >
              <div className={`inline-flex rounded-xl p-2.5 ${f.bg}`}>
                <f.icon className={`h-5 w-5 ${f.color}`} />
              </div>
              <h3 className="mt-4 text-sm font-bold text-gray-900 dark:text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {f.description}
              </p>
            </motion.div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
