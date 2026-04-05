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
    <div className="space-y-1 px-3 py-4">
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      {isUser ? (
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-700 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-100">
          {message.content}
        </div>
      ) : showTyping ? (
        <TypingDots />
      ) : (
        <div className="max-w-[92%] text-sm leading-relaxed text-zinc-300">
          <MarkdownContent content={message.content} />
        </div>
      )}
    </motion.div>
  );
});

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown parser that handles common patterns
  // without requiring react-markdown (which may not be installed yet)
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableKey = 0;

  function flushTable() {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`table-${tableKey++}`} className="my-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-700">
                {tableRows[0].map((cell, i) => (
                  <th
                    key={i}
                    className="px-2 py-1.5 text-left font-semibold text-zinc-300"
                  >
                    {cell.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, ri) => (
                <tr key={ri} className="border-b border-zinc-800/50">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1.5 text-zinc-400">
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

    // Table detection
    if (line.includes("|") && line.trim().startsWith("|")) {
      const cells = line
        .split("|")
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      // Skip separator rows
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

    // Headers
    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="mb-1 mt-3 text-xs font-bold text-zinc-200">
          {formatInline(line.slice(4))}
        </h4>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="mb-1 mt-3 text-sm font-bold text-zinc-100">
          {formatInline(line.slice(3))}
        </h3>,
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="mb-2 mt-3 text-base font-bold text-zinc-100">
          {formatInline(line.slice(2))}
        </h2>,
      );
    }
    // List items
    else if (/^[-•*]\s/.test(line)) {
      elements.push(
        <div key={i} className="flex gap-2 py-0.5 pl-1">
          <span className="mt-0.5 text-zinc-600">•</span>
          <span>{formatInline(line.replace(/^[-•*]\s/, ""))}</span>
        </div>,
      );
    }
    // Numbered list
    else if (/^\d+[.)]\s/.test(line)) {
      const num = line.match(/^(\d+)[.)]\s/)?.[1];
      elements.push(
        <div key={i} className="flex gap-2 py-0.5 pl-1">
          <span className="mt-0.5 min-w-[1.2em] text-right text-zinc-500">{num}.</span>
          <span>{formatInline(line.replace(/^\d+[.)]\s/, ""))}</span>
        </div>,
      );
    }
    // Empty line
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    }
    // Regular paragraph
    else {
      elements.push(
        <p key={i} className="py-0.5">
          {formatInline(line)}
        </p>,
      );
    }
  }

  if (inTable || tableRows.length > 0) flushTable();

  return <div className="space-y-0">{elements}</div>;
}

function formatInline(text: string): React.ReactNode {
  // Bold + italic, bold, italic, code, links
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, boldMatch.index)}</span>);
      }
      parts.push(
        <strong key={key++} className="font-semibold text-zinc-100">
          {boldMatch[1]}
        </strong>,
      );
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      continue;
    }

    // Inline code
    const codeMatch = remaining.match(/`(.+?)`/);
    if (codeMatch && codeMatch.index !== undefined) {
      if (codeMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, codeMatch.index)}</span>);
      }
      parts.push(
        <code
          key={key++}
          className="rounded bg-zinc-800 px-1 py-0.5 text-xs text-zinc-200"
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
    <div className="flex items-center gap-1.5 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-zinc-600"
          animate={{ y: [0, -4, 0] }}
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
  const { colorAccent } = useBranding();

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 py-2"
    >
      <motion.span
        className="text-sm"
        style={{ color: colorAccent }}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        ✦
      </motion.span>
      <span className="text-xs text-zinc-500">
        {tools.map((t) => TOOL_LABELS[t] ?? t).join(", ")}
        ...
      </span>
    </motion.div>
  );
}
