"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, ArrowRight } from "lucide-react";
import { useSession } from "next-auth/react";
import { useBranding } from "@/components/branding-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { useMgicAI } from "./index";
import type { StreamEvent } from "@/lib/ai/types";

function getGreeting(firstName: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Buenos dias, ${firstName}`;
  if (hour < 18) return `Buenas tardes, ${firstName}`;
  return `Buenas noches, ${firstName}`;
}

function getBriefingPrompt(firstName: string): string {
  return `${firstName} acaba de abrir el dashboard. Dame 2-3 bullets cortos de lo más relevante del studio hoy/esta semana. Sé directo y personal — háblale por su nombre. No uses encabezados. Solo bullets concisos y accionables.`;
}

function todayKey(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}`;
}

const DISMISS_KEY_PREFIX = "mgic-ai-briefing-dismissed";
const CACHE_KEY_PREFIX = "mgic-ai-briefing-cache";

export function MgicAIBriefing() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(false);
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
            }
          } catch {}
        }
      }

      if (fullText) {
        try { localStorage.setItem(todayKey(CACHE_KEY_PREFIX), fullText); } catch {}
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
        className="mb-6 overflow-hidden rounded-2xl bg-white shadow-[0_2px_20px_-4px_rgba(0,0,0,0.08)]"
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
                  {greeting} <span className="inline-block animate-pulse">&#x1F44B;</span>
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
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-muted/30" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-muted/30" />
                <Skeleton className="h-4 w-3/5" />
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-muted/30" />
                <Skeleton className="h-4 w-2/5" />
              </div>
            </div>
          ) : error ? (
            <p className="pl-[52px] text-sm text-muted">
              No pude preparar el resumen hoy. Abre Spark para consultar.
            </p>
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
