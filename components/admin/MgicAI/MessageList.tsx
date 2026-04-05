"use client";

import { memo } from "react";
import { motion } from "framer-motion";
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
  cancel_class: "Cancelando clase",
  send_announcement: "Enviando anuncio",
};

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
          {message.content}
        </div>
      ) : showTyping ? (
        <TypingDots />
      ) : (
        <div className="max-w-[95%] text-[14px] leading-[1.7] text-foreground">
          <MarkdownContent content={message.content} />
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
        <code
          key={key++}
          className="rounded-md bg-surface px-1.5 py-0.5 text-[13px] font-medium text-foreground"
        >
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
  const { colorAdmin } = useBranding();

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
      >
        <Sparkles className="h-4 w-4" style={{ color: colorAdmin }} />
      </motion.div>
      <span className="text-[13px] font-medium text-muted">
        {tools.map((t) => TOOL_LABELS[t] ?? t).join(", ")}...
      </span>
    </motion.div>
  );
}
