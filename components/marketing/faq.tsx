"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    q: "¿Cuánto tarda configurar Mgic?",
    a: "La mayoría de los studios están operando en menos de 30 minutos. Nos encargamos de migrar los datos desde tu plataforma actual y nuestro equipo te acompaña en cada paso. No se requieren conocimientos técnicos.",
  },
  {
    q: "¿Mis miembros necesitan descargar una app?",
    a: "No. La app de miembros de Mgic es una Progressive Web App (PWA) — los miembros solo abren tu enlace con tu marca y la añaden a la pantalla de inicio. Se ve y se siente nativa, sin pasar por la App Store.",
  },
  {
    q: "¿Qué procesador de pagos usan?",
    a: "Usamos Stripe Connect para pagos seguros y globales. Tus miembros pagan con tarjeta y los fondos llegan directo a tu cuenta bancaria. Nosotros nunca retenemos tu dinero.",
  },
  {
    q: "¿Puedo gestionar múltiples locaciones?",
    a: "Por supuesto. Nuestro plan Scale incluye gestión multi-studio completa — salas, coaches y horarios separados por locación, todo controlado desde un mismo dashboard.",
  },
  {
    q: "¿Cómo funciona MgicAI?",
    a: "MgicAI está impulsado por Claude y analiza los datos de tu studio en tiempo real. Genera briefings diarios, identifica miembros en riesgo, proyecta ingresos y responde preguntas sobre tu negocio en lenguaje natural. Disponible en los planes Growth y Scale.",
  },
  {
    q: "¿Qué diferencia hay entre las funciones sociales y un simple grupo de WhatsApp?",
    a: "La capa social de Mgic vive dentro de la experiencia de reserva. Los miembros ven qué clases reservan sus amigos, dan kudos después de las clases, celebran logros y descubren nuevos amigos a través de sesiones compartidas. Es contextual, no solo chat.",
  },
  {
    q: "¿Se integran con ClassPass o Gympass?",
    a: "Sí. El plan Scale incluye integración completa con ClassPass y Gympass — gestiona cuotas, check-ins, exporta datos de reconciliación y mide cuáles reservas externas se convierten en miembros.",
  },
  {
    q: "¿Hay contrato o compromiso?",
    a: "Sin contratos, nunca. Todos los planes son mes a mes. Puedes subir, bajar o cancelar cuando quieras. Creemos que el producto debe ganarse tu confianza cada mes.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="text-sm sm:text-base font-semibold text-foreground pr-4">{q}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-muted"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm text-muted leading-relaxed pr-10">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MarketingFAQ() {
  return (
    <section id="faq" className="py-20 md:py-28 bg-surface/50">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-sm font-semibold text-accent mb-3">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            ¿Preguntas? Respuestas.
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="border-t border-border"
        >
          {faqs.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
