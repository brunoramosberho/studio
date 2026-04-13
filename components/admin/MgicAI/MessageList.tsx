"use client";

import { memo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";
import type { AiMessage } from "./index";

interface MessageListProps {
  messages: AiMessage[];
  isStreaming: boolean;
  activeTools: string[];
}

const TOOL_LABELS: Record<string, string> = {
  get_studio_overview: "Analizando métricas del studio",
  get_class_stats: "Revisando estadísticas de clases",
  get_coach_performance: "Evaluando rendimiento de coaches",
  get_retention_metrics: "Analizando retención",
  get_member_activity: "Consultando actividad de miembros",
  get_waitlist_data: "Revisando lista de espera",
  get_revenue_summary: "Calculando ingresos",
  get_schedule: "Consultando horario",
  create_class: "Creando clase",
  create_class_batch: "Armando el horario",
  update_class: "Actualizando clase",
  cancel_class: "Cancelando clase",
  send_announcement: "Enviando anuncio",
  create_studio: "Creando estudio",
  create_room: "Creando sala",
  invite_coach: "Invitando coach",
  create_client: "Registrando cliente",
  create_class_type: "Creando disciplina",
  create_post: "Publicando post",
  get_availability_coverage: "Consultando cobertura del equipo",
  get_availability_pending: "Revisando solicitudes pendientes",
  get_substitute_suggestions: "Buscando coaches sustitutos",
  review_availability_request: "Procesando solicitud de disponibilidad",
  get_packages_overview: "Revisando paquetes y ventas",
  get_subscriptions_status: "Analizando suscripciones",
  get_finance_summary: "Calculando finanzas detalladas",
  get_checkin_stats: "Consultando check-ins del día",
  get_platform_status: "Revisando plataformas externas",
  get_client_detail: "Consultando perfil del cliente",
  get_coach_detail: "Consultando perfil del coach",
  get_ratings_summary: "Analizando ratings de clases",
  get_gamification_overview: "Revisando gamificación",
  get_referral_metrics: "Analizando programa de referidos",
  propose_weekly_schedule: "Diseñando el horario ideal",
};

const FITNESS_THINKING_PHRASES = [
  "Haciendo burpees mentales",
  "En posición de plancha",
  "Estirando las neuronas",
  "Calentando motores",
  "En el reformer de datos",
  "Haciendo jumping jacks",
  "Sosteniendo la postura",
  "En clase de HIIT cerebral",
  "Respirando profundo",
  "Cargando las pesas",
  "Haciendo crunches de números",
  "Sudando la respuesta",
  "En el mat pensando",
  "Sprint final",
  "Flexionando ideas",
  "Pedaleando fuerte",
  "Agarrando el ritmo",
  "En equilibrio",
  "Elongando la respuesta",
  "Activando el core",
  "Escalando la wall",
  "Boxeando con los datos",
  "En modo barre",
  "Flow de vinyasa",
  "Saltando la cuerda",
  "Remando en el erg",
  "Haciendo sentadillas",
  "Push-ups de análisis",
  "En el spin de datos",
  "Kettlebell swing mental",
];

// Tools that should show a fun fitness phrase instead of a label
const SILENT_TOOLS = new Set(["log_feature_request"]);

function getThinkingPhrase(): string {
  return FITNESS_THINKING_PHRASES[Math.floor(Math.random() * FITNESS_THINKING_PHRASES.length)];
}

export function MessageList({ messages, isStreaming, activeTools }: MessageListProps) {
  return (
    <div className="space-y-4 px-5 py-5">
      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isLast={i === messages.length - 1}
          isStreaming={isStreaming}
        />
      ))}
      {isStreaming && activeTools.length > 0 && (
        <ToolCallIndicator tools={activeTools} />
      )}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  message,
  isLast,
  isStreaming,
}: {
  message: AiMessage;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";
  const showTyping = !isUser && isLast && isStreaming && !message.content;
  const { colorAdmin } = useBranding();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      {isUser ? (
        <div
          className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-[14px] leading-relaxed text-white"
          style={{ backgroundColor: colorAdmin }}
        >
          {message.displayContent ?? message.content}
        </div>
      ) : showTyping ? (
        <div className="flex items-end gap-2.5">
          <img src="/spark-avatar.png" alt="Spark" className="h-6 w-6 shrink-0 rounded-full object-cover" />
          <TypingDots />
        </div>
      ) : (
        <div className="flex gap-2.5">
          <img src="/spark-avatar.png" alt="Spark" className="mt-1 h-6 w-6 shrink-0 rounded-full object-cover" />
          <div className="max-w-[90%] text-[14px] leading-[1.7] text-foreground">
            <MarkdownContent content={message.content} />
          </div>
        </div>
      )}
    </motion.div>
  );
});

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableKey = 0;

  function flushTable() {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`table-${tableKey++}`} className="my-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface">
                {tableRows[0].map((cell, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left font-semibold text-foreground"
                  >
                    {cell.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, ri) => (
                <tr key={ri} className="border-b border-border/50 last:border-0">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-muted">
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      tableRows = [];
    }
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes("|") && line.trim().startsWith("|")) {
      const cells = line
        .split("|")
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (cells.every((c) => /^[\s-:]+$/.test(c))) {
        inTable = true;
        continue;
      }
      if (inTable || tableRows.length > 0) {
        tableRows.push(cells);
        inTable = true;
        continue;
      }
      tableRows.push(cells);
      continue;
    }

    if (inTable) flushTable();

    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="mb-1 mt-4 text-[13px] font-bold uppercase tracking-wide text-muted">
          {formatInline(line.slice(4))}
        </h4>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="mb-1 mt-4 text-[15px] font-bold text-foreground">
          {formatInline(line.slice(3))}
        </h3>,
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="mb-2 mt-4 text-base font-bold text-foreground">
          {formatInline(line.slice(2))}
        </h2>,
      );
    } else if (/^[-•*]\s/.test(line)) {
      elements.push(
        <div key={i} className="flex gap-2.5 py-0.5 pl-1">
          <span className="mt-[2px] text-muted">•</span>
          <span className="flex-1">{formatInline(line.replace(/^[-•*]\s/, ""))}</span>
        </div>,
      );
    } else if (/^\d+[.)]\s/.test(line)) {
      const num = line.match(/^(\d+)[.)]\s/)?.[1];
      elements.push(
        <div key={i} className="flex gap-2.5 py-0.5 pl-1">
          <span className="mt-[2px] min-w-[1.4em] text-right font-medium text-muted">{num}.</span>
          <span className="flex-1">{formatInline(line.replace(/^\d+[.)]\s/, ""))}</span>
        </div>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="py-0.5">
          {formatInline(line)}
        </p>,
      );
    }
  }

  if (inTable || tableRows.length > 0) flushTable();

  return <div>{elements}</div>;
}

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);

    const candidates: { type: string; index: number; match: RegExpMatchArray }[] = [];
    if (linkMatch?.index !== undefined) candidates.push({ type: "link", index: linkMatch.index, match: linkMatch });
    if (boldMatch?.index !== undefined) candidates.push({ type: "bold", index: boldMatch.index, match: boldMatch });
    if (codeMatch?.index !== undefined) candidates.push({ type: "code", index: codeMatch.index, match: codeMatch });

    if (candidates.length === 0) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    candidates.sort((a, b) => a.index - b.index);
    const first = candidates[0];

    if (first.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, first.index)}</span>);
    }

    if (first.type === "link") {
      const [fullMatch, label, href] = first.match;
      const isInternal = href.startsWith("/");
      if (isInternal) {
        parts.push(
          <Link
            key={key++}
            href={href}
            className="inline-flex items-center gap-1 font-medium text-admin underline decoration-admin/30 underline-offset-2 transition-colors hover:text-admin/80 hover:decoration-admin/50"
          >
            {label}
          </Link>,
        );
      } else {
        parts.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-admin underline decoration-admin/30 underline-offset-2 transition-colors hover:text-admin/80 hover:decoration-admin/50"
          >
            {label}
            <ExternalLink className="inline h-3 w-3" />
          </a>,
        );
      }
      remaining = remaining.slice(first.index + fullMatch.length);
    } else if (first.type === "bold") {
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {first.match[1]}
        </strong>,
      );
      remaining = remaining.slice(first.index + first.match[0].length);
    } else {
      parts.push(
        <code
          key={key++}
          className="rounded-md bg-surface px-1.5 py-0.5 text-[13px] font-medium text-foreground"
        >
          {first.match[1]}
        </code>,
      );
      remaining = remaining.slice(first.index + first.match[0].length);
    }
  }

  return <>{parts}</>;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-muted/50"
          animate={{ y: [0, -5, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function ToolCallIndicator({ tools }: { tools: string[] }) {
  const visibleTools = tools.filter((t) => !SILENT_TOOLS.has(t));
  const realLabel = visibleTools.length > 0
    ? visibleTools.map((t) => TOOL_LABELS[t] ?? t).join(", ")
    : null;

  const [phase, setPhase] = useState<"real" | "fitness">("real");
  const [fitnessPhrase, setFitnessPhrase] = useState(() => getThinkingPhrase());
  const usedPhrases = useRef(new Set<string>());

  // After 3s on real label, switch to cycling fitness phrases
  useEffect(() => {
    if (!realLabel) {
      setPhase("fitness");
      return;
    }
    setPhase("real");
    usedPhrases.current.clear();
    const timer = setTimeout(() => setPhase("fitness"), 3000);
    return () => clearTimeout(timer);
  }, [realLabel]);

  // Cycle fitness phrases every 2.5s
  useEffect(() => {
    if (phase !== "fitness") return;
    const interval = setInterval(() => {
      let next = getThinkingPhrase();
      let attempts = 0;
      while (usedPhrases.current.has(next) && attempts < 10) {
        next = getThinkingPhrase();
        attempts++;
      }
      // Reset pool if we've used most of them
      if (usedPhrases.current.size > FITNESS_THINKING_PHRASES.length - 5) {
        usedPhrases.current.clear();
      }
      usedPhrases.current.add(next);
      setFitnessPhrase(next);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase]);

  const label = phase === "real" && realLabel ? realLabel : fitnessPhrase;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3"
    >
      <motion.img
        src="/spark-avatar.png"
        alt="Spark"
        className="h-5 w-5 rounded-full object-cover"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        key={label}
        initial={{ opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-[13px] font-medium text-muted"
      >
        {label}...
      </motion.span>
    </motion.div>
  );
}
