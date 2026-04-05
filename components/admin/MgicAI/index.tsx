"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import type { StreamEvent } from "@/lib/ai/types";

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolsUsed?: string[];
}

interface MgicAIContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  messages: AiMessage[];
  sendMessage: (content: string) => void;
  isStreaming: boolean;
  activeTools: string[];
  clearChat: () => void;
}

const MgicAIContext = createContext<MgicAIContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
  messages: [],
  sendMessage: () => {},
  isStreaming: false,
  activeTools: [],
  clearChat: () => {},
});

export function useMgicAI() {
  return useContext(MgicAIContext);
}

const STORAGE_KEY_PREFIX = "mgic-ai-chat-";
const DAILY_PROMPT =
  "Dame un resumen rápido del estado del studio hoy — ocupación, algo destacable y si hay algo que debería revisar.";

function getStorageKey() {
  return `${STORAGE_KEY_PREFIX}current`;
}

export function MgicAIProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const hasAutoSent = useRef(false);
  const { studioName } = useBranding();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(getStorageKey(), JSON.stringify(messages));
      }
    } catch {}
  }, [messages]);

  const processStream = useCallback(
    async (
      apiMessages: { role: "user" | "assistant"; content: string }[],
      assistantMsgId: string,
    ) => {
      setIsStreaming(true);
      setActiveTools([]);

      try {
        abortRef.current = new AbortController();
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Error desconocido" }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        if (!res.body) throw new Error("No response body");

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

              switch (event.type) {
                case "text_delta":
                  fullText += event.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: fullText } : m,
                    ),
                  );
                  break;
                case "tool_call":
                  setActiveTools(event.tools);
                  break;
                case "done":
                  setActiveTools([]);
                  break;
                case "error":
                  fullText += `\n\n⚠ Error: ${event.message}`;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: fullText } : m,
                    ),
                  );
                  break;
              }
            } catch {}
          }
        }

        if (!fullText) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: "No pude generar una respuesta. Intenta de nuevo." }
                : m,
            ),
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `⚠ ${err instanceof Error ? err.message : "Error desconocido"}`,
                }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
        setActiveTools([]);
        abortRef.current = null;
      }
    },
    [],
  );

  const sendMessage = useCallback(
    (content: string) => {
      if (isStreaming || !content.trim()) return;

      const userMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      const assistantMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      const withUser = [...messages, userMsg];
      setMessages([...withUser, assistantMsg]);

      const apiMessages = withUser
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-20);

      processStream(apiMessages, assistantMsg.id);
    },
    [messages, isStreaming, processStream],
  );

  const clearChat = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsStreaming(false);
    setActiveTools([]);
    localStorage.removeItem(getStorageKey());
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);

    if (!hasAutoSent.current && messages.length === 0) {
      hasAutoSent.current = true;
      const todayKey = `mgic-ai-daily-${new Date().toISOString().slice(0, 10)}`;
      const alreadySentToday = localStorage.getItem(todayKey);
      if (!alreadySentToday) {
        localStorage.setItem(todayKey, "1");
        setTimeout(() => {
          const userMsg: AiMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: DAILY_PROMPT,
            timestamp: Date.now(),
          };
          const assistantMsg: AiMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            timestamp: Date.now(),
          };
          setMessages([userMsg, assistantMsg]);
          processStream(
            [{ role: "user" as const, content: DAILY_PROMPT }],
            assistantMsg.id,
          );
        }, 100);
      }
    }
  }, [messages.length, processStream]);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => {
    if (isOpen) close();
    else open();
  }, [isOpen, close, open]);

  return (
    <MgicAIContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        messages,
        sendMessage,
        isStreaming,
        activeTools,
        clearChat,
      }}
    >
      {children}
      <MgicAIButton studioName={studioName} />
      <MgicAIPanel studioName={studioName} />
    </MgicAIContext.Provider>
  );
}

function MgicAIButton({ studioName }: { studioName: string }) {
  const { toggle, isOpen } = useMgicAI();
  const { colorAdmin } = useBranding();

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.button
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggle}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-lg transition-shadow hover:shadow-xl"
          style={{ backgroundColor: colorAdmin }}
          aria-label={`Abrir ${studioName} AI`}
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Mgic AI</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function MgicAIPanel({ studioName }: { studioName: string }) {
  const { isOpen, close, messages, sendMessage, isStreaming, activeTools, clearChat } =
    useMgicAI();
  const { colorAdmin } = useBranding();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTools]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[3px]"
            onClick={close}
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-dvh w-full flex-col border-l border-border/50 bg-white shadow-2xl sm:w-[440px]"
          >
            {/* Header */}
            <div
              className="flex shrink-0 items-center justify-between px-5 py-4"
              style={{ backgroundColor: colorAdmin }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Mgic AI</h3>
                  <p className="text-[11px] text-white/70">{studioName}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    title="Nueva conversación"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={close}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain bg-gradient-to-b from-slate-50 to-white"
            >
              {messages.length === 0 ? (
                <EmptyState onSend={sendMessage} />
              ) : (
                <MessageList
                  messages={messages}
                  isStreaming={isStreaming}
                  activeTools={activeTools}
                />
              )}
            </div>

            {/* Input */}
            <InputBar onSend={sendMessage} disabled={isStreaming} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function EmptyState({ onSend }: { onSend: (msg: string) => void }) {
  const { colorAdmin } = useBranding();

  const suggestions = [
    "¿Cómo va la ocupación esta semana?",
    "¿Quiénes son mis clientes en riesgo?",
    "¿Cuál es mi clase más rentable?",
    "Resumen de ingresos del mes",
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${colorAdmin}15` }}
      >
        <Sparkles className="h-7 w-7" style={{ color: colorAdmin }} />
      </div>
      <h3 className="mb-2 text-lg font-bold text-foreground">
        Mgic AI
      </h3>
      <p className="mb-8 text-sm leading-relaxed text-muted">
        Tu COO inteligente. Analizo datos, detecto oportunidades y ejecuto acciones.
      </p>
      <div className="flex flex-wrap justify-center gap-2.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSend(s)}
            className={cn(
              "rounded-xl border border-border bg-white px-4 py-2.5",
              "text-[13px] font-medium text-foreground",
              "shadow-sm transition-all hover:border-admin/30 hover:shadow-md",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
