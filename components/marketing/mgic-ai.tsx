"use client";

import { motion } from "framer-motion";

const aiCapabilities = [
  {
    title: "Briefings Inteligentes",
    desc: "Empieza cada día con insights generados por IA sobre tus reservas, ingresos y actividad de miembros.",
  },
  {
    title: "Predicción de Churn",
    desc: "MgicAI identifica a los miembros en riesgo antes de que se vayan, para que puedas contactarlos en el momento justo.",
  },
  {
    title: "Proyección de Ingresos",
    desc: "Mira hacia dónde van tus ingresos según renovaciones, pagos fallidos y tendencias de reservas.",
  },
  {
    title: "Optimización de Clases",
    desc: "Recibe recomendaciones de horarios, capacidad y precios con base en datos reales de ocupación.",
  },
];

export function MgicAI() {
  return (
    <section id="mgic-ai" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-sm font-semibold text-accent mb-3">MgicAI</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
              IA que opera tu recepción{" "}
              <em className="not-italic text-gradient">mientras enseñas</em>
            </h2>
            <p className="mt-4 text-lg text-muted leading-relaxed">
              Impulsada por Claude, MgicAI es tu asistente de studio 24/7.
              No solo responde preguntas — descubre insights que no sabías que
              necesitabas.
            </p>

            <div className="mt-10 space-y-5">
              {aiCapabilities.map((cap, i) => (
                <motion.div
                  key={cap.title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="flex gap-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent text-sm font-bold">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{cap.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{cap.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="rounded-2xl border border-border bg-white shadow-xl overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border px-5 py-3 bg-surface/50">
                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                  <svg
                    className="h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">MgicAI</p>
                  <p className="text-[10px] text-green-600 font-medium">En línea</p>
                </div>
              </div>

              <div className="p-5 space-y-4 bg-surface/20">
                <div className="flex gap-3">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-accent/10 flex items-center justify-center">
                    <svg
                      className="h-3.5 w-3.5 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-white border border-border p-3 max-w-[85%]">
                    <p className="text-xs text-foreground leading-relaxed">
                      ¡Buenos días! Este es tu briefing del día:
                    </p>
                    <div className="mt-2 space-y-1.5 text-xs text-muted">
                      <p>
                        📈 <strong className="text-foreground">Ingresos +18%</strong> esta semana
                        vs. la anterior — impulsados por 12 nuevas membresías.
                      </p>
                      <p>
                        ⚠️ <strong className="text-foreground">3 miembros en riesgo</strong> de
                        irse — sin visitas en 14+ días.
                      </p>
                      <p>
                        🔥 <strong className="text-foreground">HIIT del jueves 6 PM</strong> está al
                        94% de capacidad — considera abrir una segunda sesión.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-tr-sm bg-foreground p-3 max-w-[75%]">
                    <p className="text-xs text-white">
                      ¿A qué miembros debería contactar hoy?
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-accent/10 flex items-center justify-center">
                    <svg
                      className="h-3.5 w-3.5 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-white border border-border p-3 max-w-[85%]">
                    <p className="text-xs text-foreground leading-relaxed mb-2">
                      Priorizaría a estas tres:
                    </p>
                    <div className="space-y-2">
                      {[
                        {
                          name: "Emma Wilson",
                          reason: "Sin visitas en 16 días. Normalmente viene 3 veces por semana.",
                          action: "Enviar mensaje de reconexión",
                        },
                        {
                          name: "David Chen",
                          reason: "Su paquete vence en 3 días y no ha renovado.",
                          action: "Ofrecer incentivo de renovación",
                        },
                        {
                          name: "Mia Torres",
                          reason: "¡Cumple años mañana! Miembro fiel, 48 clases.",
                          action: "Enviar felicitación de cumpleaños",
                        },
                      ].map((m) => (
                        <div
                          key={m.name}
                          className="rounded-lg bg-surface p-2 text-[11px]"
                        >
                          <p className="font-semibold text-foreground">{m.name}</p>
                          <p className="text-muted-foreground">{m.reason}</p>
                          <p className="text-accent font-medium mt-0.5">
                            → {m.action}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border px-4 py-3 flex items-center gap-3">
                <div className="flex-1 rounded-full bg-surface border border-border px-4 py-2 text-xs text-muted-foreground">
                  Pregúntale lo que sea a MgicAI sobre tu studio...
                </div>
                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                  <svg
                    className="h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
