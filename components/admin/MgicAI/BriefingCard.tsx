"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, ArrowRight } from "lucide-react";
import { useSession } from "next-auth/react";
import { useBranding } from "@/components/branding-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { useMgicAI } from "./index";
import type { StreamEvent } from "@/lib/ai/types";

const GREETINGS: [number, string[]][] = [
  [5, [
    "A estas horas, {name}? Respect.",
    "Trasnochando, {name}? Yo tampoco dormí.",
    "{name}, a estas horas solo estamos tú y yo.",
  ]],
  [7, [
    "Arrancando temprano, {name}.",
    "Madrugaste, {name} — ya somos dos.",
    "Nadie como tú para madrugar, {name}.",
  ]],
  [12, [
    "Buenos días, {name}.",
    "Buen día, {name} — vamos a ver qué hay.",
    "Hey {name}, buenos días.",
  ]],
  [14, [
    "Mediodía, {name} — espero que ya hayas comido.",
    "Hey {name}, ¿ya comiste o te gano el studio?",
    "Buenas, {name} — pausa pa' comer, ¿no?",
  ]],
  [18, [
    "Buenas tardes, {name}.",
    "Hey {name}, ¿cómo va la tarde?",
    "Buenas, {name} — te tengo al tanto.",
  ]],
  [21, [
    "Cerrando el día, {name}?",
    "Buenas noches, {name} — revisión rápida.",
    "Ya casi, {name} — un vistazo antes de cerrar.",
  ]],
  [24, [
    "Aún por aquí, {name}? Yo te acompaño.",
    "Sesión nocturna, {name} — te tengo tu resumen.",
    "Noche de trabajo, {name}? Aquí estoy.",
  ]],
];

function getGreeting(firstName: string): string {
  const hour = new Date().getHours();
  const bracket = GREETINGS.find(([max]) => hour < max) ?? GREETINGS[GREETINGS.length - 1];
  const options = bracket[1];
  // Pick a deterministic-ish option based on the day so it doesn't change on re-render
  const dayIndex = new Date().getDate() % options.length;
  return options[dayIndex].replace("{name}", firstName);
}

function getBriefingPrompt(firstName: string): string {
  return `${firstName} acaba de abrir el dashboard. Tu trabajo: encontrar 1-2 cosas CONCRETAS sobre las que pueda actuar HOY. No le des un resumen genérico.

ANTES de responder, usa tus tools para investigar lo que pueda ser más urgente. Pista de dónde buscar:
- get_class_stats — clases en las próximas 48-72h con baja ocupación (<30%)
- get_subscriptions_status — suscripciones en riesgo (cancel_at_period_end o churn reciente)
- get_packages_overview — paquetes por vencer en 7 días o paquetes sin ventas en 30+ días
- get_ratings_summary — coaches con ratings bajos recientes
- get_retention_metrics — miembros antes activos que llevan 14+ días dormidos
- get_finance_summary — tendencia vs semana anterior si hay drop notorio
- get_platform_status — alertas sin resolver

REGLAS DE FORMATO:
- 1-2 bullets MÁXIMO. No más.
- Cada bullet debe ser ESPECÍFICO con dato + acción sugerida ("Tu clase del jueves 8am tiene 1/12 reservas — considera bajar precio o cancelar antes de 24h").
- Si todo va bien, da 1 bullet POSITIVO con dato concreto ("Vas +18% en ingresos vs semana pasada — ${firstName}, buen ritmo").
- NO digas "todo bien" sin respaldo numérico.
- NO uses encabezados (##), tablas ni gráficas. Solo bullets cortos.
- NO termines invitándolo a abrir Spark — ya hay un botón aparte.
- Háblale de tú, en español, tono cercano.`;
}

function todayKey(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}`;
}

const DISMISS_KEY_PREFIX = "mgic-ai-briefing-dismissed";
const CACHE_KEY_PREFIX = "mgic-ai-briefing-cache";

const TOOL_LABELS: Record<string, string> = {
  get_class_stats: "ocupación de clases",
  get_subscriptions_status: "suscripciones",
  get_packages_overview: "paquetes",
  get_ratings_summary: "ratings",
  get_retention_metrics: "retención",
  get_finance_summary: "finanzas",
  get_platform_status: "plataformas",
  get_studio_overview: "métricas generales",
  get_coach_performance: "coaches",
  get_member_activity: "actividad de miembros",
  get_checkin_stats: "check-ins",
  get_packages_expiring: "paquetes por vencer",
};

export function MgicAIBriefing() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const { colorAdmin } = useBranding();
  const { open } = useMgicAI();
  const { data: session } = useSession();
  const hasFetched = useRef(false);

  const adminName = session?.user?.name || "Admin";
  const firstName = adminName.split(" ")[0];
  const greeting = getGreeting(firstName);

  useEffect(() => {
    if (localStorage.getItem(todayKey(DISMISS_KEY_PREFIX))) {
      setDismissed(true);
      setLoading(false);
      return;
    }

    const cached = localStorage.getItem(todayKey(CACHE_KEY_PREFIX));
    if (cached) {
      setContent(cached);
      setLoading(false);
    }
  }, []);

  const fetchBriefing = useCallback(async () => {
    if (hasFetched.current || dismissed) return;
    if (content) return;
    if (!session?.user?.name) return;
    hasFetched.current = true;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: getBriefingPrompt(firstName) }],
        }),
      });

      if (!res.ok || !res.body) {
        setError(true);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          try {
            const event: StreamEvent = JSON.parse(trimmed.slice(6));
            if (event.type === "text_delta") {
              fullText += event.text;
              setContent(fullText);
            } else if (event.type === "tool_call") {
              setActiveTools((prev) => Array.from(new Set([...prev, ...event.tools])));
            }
          } catch {}
        }
      }

      if (fullText) {
        try { localStorage.setItem(todayKey(CACHE_KEY_PREFIX), fullText); } catch {}
      } else {
        // Stream finished with no text — Spark probably had nothing notable
        // to report (empty studio, all-zero data). Treat as soft error so we
        // render a fallback instead of an empty card.
        setError(true);
      }

      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [dismissed, content, firstName, session?.user?.name]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  const dismiss = () => {
    localStorage.setItem(todayKey(DISMISS_KEY_PREFIX), "1");
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        className="mb-6 overflow-hidden rounded-2xl bg-card shadow-[0_2px_20px_-4px_rgba(0,0,0,0.08)]"
      >
        {/* Gradient accent bar */}
        <div
          className="h-1"
          style={{
            background: `linear-gradient(90deg, ${colorAdmin}, ${colorAdmin}88, ${colorAdmin}44)`,
          }}
        />
        <div className="p-5 sm:p-6">
          {/* Header: greeting + avatar + dismiss */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm"
                style={{ backgroundColor: `${colorAdmin}15` }}
              >
                <img
                  src="/spark-avatar.png"
                  alt="Spark"
                  className="h-7 w-7 rounded-lg object-cover"
                />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-foreground leading-tight">
                  {greeting}
                </h3>
                <p className="text-xs text-muted/70 mt-0.5">
                  Spark te preparó un resumen rápido
                </p>
              </div>
            </div>
            <button
              onClick={dismiss}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted/40 transition-colors hover:bg-surface hover:text-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Content */}
          {loading && !content ? (
            <div className="space-y-3 pl-[52px]">
              {activeTools.length > 0 && (
                <p className="text-xs text-muted/80">
                  Analizando{" "}
                  <span className="font-medium text-foreground/70">
                    {activeTools
                      .map((t) => TOOL_LABELS[t] ?? t.replace(/^get_/, "").replace(/_/g, " "))
                      .join(", ")}
                  </span>
                  …
                </p>
              )}
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-muted/30" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-muted/30" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            </div>
          ) : error ? (
            <div className="space-y-3 pl-[52px]">
              <p className="text-sm text-foreground/80 leading-relaxed">
                {firstName}, aún no hay suficiente actividad para preparar un
                resumen. En cuanto empieces a registrar clases, ventas y
                check-ins, te paso lo más relevante cada día.
              </p>
              <p className="text-xs text-muted/70">
                Mientras tanto, pregúntame lo que necesites — puedo armar
                horarios, invitar coaches, crear clases y más.
              </p>
            </div>
          ) : (
            <div className="pl-[52px]">
              <BriefingMarkdown content={content} accentColor={colorAdmin} />
            </div>
          )}

          {/* CTA */}
          <div className="mt-4 pl-[52px]">
            <button
              onClick={open}
              className="group inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all hover:gap-2.5"
              style={{ color: colorAdmin, backgroundColor: `${colorAdmin}10` }}
            >
              Preguntarle algo a Spark
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function BriefingMarkdown({ content, accentColor }: { content: string; accentColor: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(
        <p key={i} className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wider text-muted/60 first:mt-0">
          {formatInline(line.slice(4))}
        </p>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <p key={i} className="mb-1.5 mt-3 text-sm font-bold text-foreground first:mt-0">
          {formatInline(line.slice(3))}
        </p>,
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <p key={i} className="mb-2 mt-3 text-base font-bold text-foreground first:mt-0">
          {formatInline(line.slice(2))}
        </p>,
      );
    } else if (/^[-•*]\s/.test(line)) {
      elements.push(
        <div key={i} className="flex gap-2.5 py-1 text-[13px] leading-relaxed text-foreground/80">
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <span className="flex-1">{formatInline(line.replace(/^[-•*]\s/, ""))}</span>
        </div>,
      );
    } else if (/^\d+[.)]\s/.test(line)) {
      const num = line.match(/^(\d+)/)?.[1];
      elements.push(
        <div key={i} className="flex gap-2 py-1 text-[13px] leading-relaxed text-foreground/80">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: accentColor }}
          >
            {num}
          </span>
          <span className="flex-1">{formatInline(line.replace(/^\d+[.)]\s/, ""))}</span>
        </div>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />);
    } else {
      elements.push(
        <p key={i} className="py-0.5 text-[13px] leading-relaxed text-foreground/80">
          {formatInline(line)}
        </p>,
      );
    }
  }

  return <div>{elements}</div>;
}

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, boldMatch.index)}</span>);
      }
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {boldMatch[1]}
        </strong>,
      );
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/`(.+?)`/);
    if (codeMatch && codeMatch.index !== undefined) {
      if (codeMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, codeMatch.index)}</span>);
      }
      parts.push(
        <code key={key++} className="rounded bg-surface px-1 py-0.5 text-xs font-medium text-foreground">
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
      continue;
    }

    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return <>{parts}</>;
}
