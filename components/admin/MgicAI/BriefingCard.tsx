"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useBranding } from "@/components/branding-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { useMgicAI } from "./index";
import type { StreamEvent } from "@/lib/ai/types";

const BRIEFING_PROMPT =
  "Dame 2-3 bullets de lo más importante que debo saber del studio esta semana. Sé muy conciso.";

function getDismissKey() {
  return `mgic-ai-briefing-dismissed-${new Date().toISOString().slice(0, 10)}`;
}

export function MgicAIBriefing() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(false);
  const { colorAdmin } = useBranding();
  const { open } = useMgicAI();
  const hasFetched = useRef(false);

  useEffect(() => {
    if (localStorage.getItem(getDismissKey())) {
      setDismissed(true);
      setLoading(false);
    }
  }, []);

  const fetchBriefing = useCallback(async () => {
    if (hasFetched.current || dismissed) return;
    hasFetched.current = true;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: BRIEFING_PROMPT }],
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
            }
          } catch {}
        }
      }

      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [dismissed]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  const dismiss = () => {
    localStorage.setItem(getDismissKey(), "1");
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        className="mb-6 overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-warm)]"
      >
        <div
          className="h-0.5"
          style={{ backgroundColor: colorAdmin, opacity: 0.3 }}
        />
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5" style={{ color: colorAdmin }} />
              Mgic AI — Resumen de hoy
            </span>
            <button
              onClick={dismiss}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted/50 transition-colors hover:bg-surface hover:text-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading && !content ? (
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ) : error ? (
            <p className="text-sm text-muted">
              No se pudo generar el resumen. Abre Mgic AI para consultar.
            </p>
          ) : (
            <BriefingMarkdown content={content} />
          )}

          <button
            onClick={open}
            className="mt-4 text-xs font-semibold transition-colors hover:opacity-80"
            style={{ color: colorAdmin }}
          >
            Hacer una pregunta →
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function BriefingMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(
        <p key={i} className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-muted first:mt-0">
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
        <div key={i} className="flex gap-2 py-0.5 text-sm leading-relaxed text-foreground/80">
          <span className="mt-0.5 text-muted/50">•</span>
          <span className="flex-1">{formatInline(line.replace(/^[-•*]\s/, ""))}</span>
        </div>,
      );
    } else if (/^\d+[.)]\s/.test(line)) {
      const num = line.match(/^(\d+)/)?.[1];
      elements.push(
        <div key={i} className="flex gap-2 py-0.5 text-sm leading-relaxed text-foreground/80">
          <span className="mt-0.5 min-w-[1.2em] text-right font-medium text-muted/60">{num}.</span>
          <span className="flex-1">{formatInline(line.replace(/^\d+[.)]\s/, ""))}</span>
        </div>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(
        <p key={i} className="py-0.5 text-sm leading-relaxed text-foreground/80">
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
