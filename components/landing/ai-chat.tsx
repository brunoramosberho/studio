"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Sparkles } from "lucide-react";
import { FadeIn } from "./motion";

const conversations = [
  {
    question: "¿Qué clientes están en riesgo de irse?",
    answer:
      "Detecté 8 miembros que no reservan hace +14 días. Los top 3: María García (18 días), Carlos Ruiz (16 días) y Ana Torres (15 días). ¿Envío un email de reactivación con un 15% de descuento?",
  },
  {
    question: "¿Cómo van las ventas este mes?",
    answer:
      "Revenue de enero: $84,200 MXN (+12% vs diciembre). Los paquetes de 10 clases son los más vendidos (62%). Sugiero crear un pack de 5 clases a $799 para captar nuevos clientes.",
  },
  {
    question: "¿Cuál es la mejor hora para abrir una clase nueva?",
    answer:
      "Basado en los últimos 3 meses: los miércoles a las 19:00 tienen el mayor demand sin oferta. Si abres Reformer Flow en ese horario, proyecto 85% de ocupación desde la semana 2.",
  },
];

export function AIChat() {
  const [convIndex, setConvIndex] = useState(0);
  const [phase, setPhase] = useState<"typing-q" | "q-done" | "typing-a" | "a-done">("typing-q");
  const [displayedQ, setDisplayedQ] = useState("");
  const [displayedA, setDisplayedA] = useState("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const conv = conversations[convIndex];

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setPhase("typing-q");
      setDisplayedQ("");
      setDisplayedA("");

      for (let i = 0; i <= conv.question.length; i++) {
        if (cancelled) return;
        setDisplayedQ(conv.question.slice(0, i));
        await delay(30);
      }
      if (cancelled) return;
      setPhase("q-done");
      await delay(600);

      if (cancelled) return;
      setPhase("typing-a");
      await delay(800);

      for (let i = 0; i <= conv.answer.length; i++) {
        if (cancelled) return;
        setDisplayedA(conv.answer.slice(0, i));
        await delay(12);
      }
      if (cancelled) return;
      setPhase("a-done");
      await delay(4000);

      if (cancelled) return;
      setConvIndex((prev) => (prev + 1) % conversations.length);
    }

    run();
    return () => { cancelled = true; };
  }, [convIndex, conv.question, conv.answer]);

  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <FadeIn>
            <p className="text-xs font-semibold uppercase tracking-widest text-purple-500">AI Assistant</p>
            <h2
              className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl dark:text-white"
              style={{ fontFamily: "var(--font-jakarta)" }}
            >
              Tu analista de datos,
              <br />
              24/7.
            </h2>
            <p className="mt-4 max-w-md text-gray-500 dark:text-gray-400">
              Pregunta en lenguaje natural sobre tus clientes, revenue, ocupación y tendencias.
              El AI assistant analiza tus datos y te da insights accionables.
            </p>
            <div className="mt-6 space-y-3">
              {[
                "Detección de clientes en riesgo",
                "Sugerencias de pricing basadas en demanda",
                "Proyecciones de revenue y ocupación",
                "Reportes automáticos semanales",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{item}</span>
                </div>
              ))}
            </div>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
              {/* Chat header */}
              <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-500/20">
                  <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">AI Assistant</p>
                  <p className="text-[11px] text-emerald-500">Online</p>
                </div>
              </div>

              {/* Messages */}
              <div className="space-y-3" style={{ minHeight: 200 }}>
                <AnimatePresence mode="wait">
                  {/* User message */}
                  {displayedQ && (
                    <motion.div
                      key={`q-${convIndex}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-gray-900 px-4 py-2.5 text-sm text-white dark:bg-gray-700"
                    >
                      {displayedQ}
                      {phase === "typing-q" && <span className="ml-0.5 animate-pulse">|</span>}
                    </motion.div>
                  )}

                  {/* Typing indicator */}
                  {phase === "typing-a" && !displayedA && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex gap-1 rounded-2xl rounded-tl-md bg-purple-50 px-4 py-3 dark:bg-purple-500/10"
                    >
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="h-2 w-2 rounded-full bg-purple-400"
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </motion.div>
                  )}

                  {/* AI message */}
                  {displayedA && (
                    <motion.div
                      key={`a-${convIndex}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="max-w-[85%] rounded-2xl rounded-tl-md bg-purple-50 px-4 py-2.5 text-sm text-gray-700 dark:bg-purple-500/10 dark:text-gray-200"
                    >
                      {displayedA}
                      {phase === "typing-a" && <span className="ml-0.5 animate-pulse text-purple-400">|</span>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Input */}
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-800">
                <span className="flex-1 text-sm text-gray-400">Pregunta algo...</span>
                <Bot className="h-4 w-4 text-purple-400" />
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
