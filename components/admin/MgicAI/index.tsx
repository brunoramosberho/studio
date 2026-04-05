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

function getStorageKey(tenantSlug: string) {
  return `${STORAGE_KEY_PREFIX}${tenantSlug}`;
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
      const raw = localStorage.getItem(getStorageKey("current"));
      if (raw) {
        const parsed = JSON.parse(raw) as AiMessage[];
        setMessages(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(getStorageKey("current"), JSON.stringify(messages));
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
                  content: `Lo siento, hubo un error: ${err instanceof Error ? err.message : "Error desconocido"}`,
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
    localStorage.removeItem(getStorageKey("current"));
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
    if (isOpen) {
      close();
    } else {
      open();
    }
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
  const { colorAccent } = useBranding();

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
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-white shadow-2xl transition-shadow hover:shadow-xl"
          style={{ backgroundColor: colorAccent }}
          aria-label={`Abrir ${studioName} AI`}
        >
          <span className="text-base">✦</span>
          <span className="hidden sm:inline">Mgic AI</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function MgicAIPanel({ studioName }: { studioName: string }) {
  const { isOpen, close, messages, sendMessage, isStreaming, activeTools, clearChat } =
    useMgicAI();
  const { colorAccent } = useBranding();
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
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
            onClick={close}
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-dvh w-full flex-col bg-zinc-900 sm:w-[420px]"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${colorAccent}20` }}
                >
                  <span className="text-sm" style={{ color: colorAccent }}>
                    ✦
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Mgic AI
                </h3>
                <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                  {studioName}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                    title="Nueva conversación"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={close}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain"
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
  const { colorAccent } = useBranding();

  const suggestions = [
    "¿Cómo va la ocupación esta semana?",
    "¿Quiénes son mis clientes en riesgo?",
    "¿Cuál es mi clase más rentable?",
    "Resumen de ingresos del mes",
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${colorAccent}15` }}
      >
        <Sparkles className="h-6 w-6" style={{ color: colorAccent }} />
      </div>
      <h3 className="mb-1 text-base font-semibold text-zinc-100">
        Mgic AI
      </h3>
      <p className="mb-6 text-sm text-zinc-500">
        Tu COO inteligente. Analizo datos, detecto oportunidades y ejecuto acciones.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSend(s)}
            className="rounded-full border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
