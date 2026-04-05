"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
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
  const { colorAccent } = useBranding();
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

      if (!res.ok) {
        setError(true);
        setLoading(false);
        return;
      }

      if (!res.body) {
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
        className="mb-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <span style={{ color: colorAccent }}>✦</span>
              Mgic AI — Resumen de hoy
            </span>
            <button
              onClick={dismiss}
              className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading && !content ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : error ? (
            <p className="text-sm text-zinc-500">
              No se pudo generar el resumen. Abre Mgic AI para consultar.
            </p>
          ) : (
            <div className="text-sm text-zinc-600 dark:text-zinc-400 [&_strong]:font-semibold [&_strong]:text-zinc-800 dark:[&_strong]:text-zinc-200">
              <BriefingMarkdown content={content} />
            </div>
          )}

          <button
            onClick={open}
            className="mt-3 text-xs font-medium transition-colors hover:opacity-80"
            style={{ color: colorAccent }}
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
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (/^[-•*]\s/.test(line)) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-zinc-400">•</span>
              <span>{formatBold(line.replace(/^[-•*]\s/, ""))}</span>
            </div>
          );
        }
        if (/^\d+[.)]\s/.test(line)) {
          const num = line.match(/^(\d+)/)?.[1];
          return (
            <div key={i} className="flex gap-2">
              <span className="text-zinc-400">{num}.</span>
              <span>{formatBold(line.replace(/^\d+[.)]\s/, ""))}</span>
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{formatBold(line)}</p>;
      })}
    </div>
  );
}

function formatBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.+?\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
