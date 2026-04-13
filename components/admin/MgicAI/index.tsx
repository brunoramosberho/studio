"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  PanelRight,
  PanelRightClose,
  Plus,
  History,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { ConfirmationCard } from "./ConfirmationCard";
import type { StreamEvent, ConfirmedTool } from "@/lib/ai/types";

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  /** Text sent to the model. Contains full prompt including tone/format directives. */
  content: string;
  /** Optional cleaner version shown in the UI. Falls back to `content` when unset. */
  displayContent?: string;
  timestamp: number;
  toolsUsed?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: AiMessage[];
  createdAt: number;
  updatedAt: number;
}

export type PanelMode = "sidebar" | "floating";

interface PendingConfirmation {
  tools: { name: string; input: Record<string, unknown> }[];
  assistantMsgId: string;
}

interface MgicAIContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  messages: AiMessage[];
  sendMessage: (content: string, displayContent?: string) => void;
  isStreaming: boolean;
  activeTools: string[];
  clearChat: () => void;
  mode: PanelMode;
  setMode: (mode: PanelMode) => void;
  panelWidth: number;
  setPanelWidth: (w: number) => void;
  conversations: Conversation[];
  newConversation: () => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  pendingConfirmation: PendingConfirmation | null;
  confirmTools: () => void;
  cancelTools: () => void;
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
  mode: "sidebar",
  setMode: () => {},
  panelWidth: 440,
  setPanelWidth: () => {},
  conversations: [],
  newConversation: () => {},
  loadConversation: () => {},
  deleteConversation: () => {},
  pendingConfirmation: null,
  confirmTools: () => {},
  cancelTools: () => {},
});

export function useMgicAI() {
  return useContext(MgicAIContext);
}

const DEFAULT_PANEL_WIDTH = 440;
const MIN_PANEL_WIDTH = 360;
const MAX_PANEL_WIDTH = 700;
const CONVERSATIONS_KEY = "mgic-ai-conversations";
const CURRENT_CONV_KEY = "mgic-ai-current-conv";
const MODE_KEY = "mgic-ai-mode";
const WIDTH_KEY = "mgic-ai-width";
const MAX_CONVERSATIONS = 50;


function generateTitle(messages: AiMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Conversación";
  const text = first.displayContent ?? first.content;
  return text.length > 50 ? text.slice(0, 50) + "…" : text;
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs.slice(0, MAX_CONVERSATIONS)));
  } catch {}
}

function loadCurrentConv(): { id: string; messages: AiMessage[] } | null {
  try {
    const raw = localStorage.getItem(CURRENT_CONV_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCurrentConv(id: string, messages: AiMessage[]) {
  try {
    localStorage.setItem(CURRENT_CONV_KEY, JSON.stringify({ id, messages }));
  } catch {}
}

function clearCurrentConv() {
  try {
    localStorage.removeItem(CURRENT_CONV_KEY);
  } catch {}
}

export function MgicAIProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [mode, setModeState] = useState<PanelMode>("sidebar");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string>(crypto.randomUUID());
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const { studioName } = useBranding();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(MODE_KEY) as PanelMode | null;
      if (savedMode === "sidebar" || savedMode === "floating") setModeState(savedMode);
      const savedWidth = localStorage.getItem(WIDTH_KEY);
      if (savedWidth) {
        const w = parseInt(savedWidth, 10);
        if (w >= MIN_PANEL_WIDTH && w <= MAX_PANEL_WIDTH) setPanelWidth(w);
      }
    } catch {}
    setConversations(loadConversations());
    const saved = loadCurrentConv();
    if (saved) {
      setCurrentConvId(saved.id);
      setMessages(saved.messages);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      saveCurrentConv(currentConvId, messages);
    }
  }, [messages, currentConvId]);

  const setMode = useCallback((m: PanelMode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch {}
  }, []);

  const handleSetPanelWidth = useCallback((w: number) => {
    const clamped = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, w));
    setPanelWidth(clamped);
    try { localStorage.setItem(WIDTH_KEY, String(clamped)); } catch {}
  }, []);

  const saveCurrentToHistory = useCallback(() => {
    if (messages.length === 0) return;
    const now = Date.now();
    const conv: Conversation = {
      id: currentConvId,
      title: generateTitle(messages),
      messages,
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== currentConvId);
      const updated = [conv, ...filtered].slice(0, MAX_CONVERSATIONS);
      saveConversations(updated);
      return updated;
    });
  }, [messages, currentConvId]);

  const processStream = useCallback(
    async (
      apiMessages: { role: "user" | "assistant"; content: string }[],
      assistantMsgId: string,
      confirmedTools?: ConfirmedTool[],
    ) => {
      setIsStreaming(true);
      setActiveTools([]);
      setPendingConfirmation(null);

      try {
        abortRef.current = new AbortController();
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            ...(confirmedTools ? { confirmed_tools: confirmedTools } : {}),
          }),
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
                case "confirmation_required":
                  setPendingConfirmation({
                    tools: event.pendingTools,
                    assistantMsgId,
                  });
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
    (content: string, displayContent?: string) => {
      if (isStreaming || !content.trim()) return;

      const trimmedDisplay = displayContent?.trim();
      const userMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        displayContent: trimmedDisplay && trimmedDisplay !== content.trim() ? trimmedDisplay : undefined,
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

  const confirmTools = useCallback(() => {
    if (!pendingConfirmation || isStreaming) return;

    const confirmed: ConfirmedTool[] = pendingConfirmation.tools.map((t) => ({
      name: t.name,
      input: t.input,
    }));

    const confirmMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: "✓ Confirmo, ejecuta la acción.",
      timestamp: Date.now(),
    };

    const assistantMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, confirmMsg, assistantMsg];
    setMessages(updatedMessages);

    const apiMessages = updatedMessages
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-20);

    processStream(apiMessages, assistantMsg.id, confirmed);
  }, [pendingConfirmation, messages, isStreaming, processStream]);

  const cancelTools = useCallback(() => {
    if (!pendingConfirmation) return;
    setPendingConfirmation(null);
    sendMessage("No, cancela la acción.");
  }, [pendingConfirmation, sendMessage]);

  const clearChat = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsStreaming(false);
    setActiveTools([]);
    setPendingConfirmation(null);
    clearCurrentConv();
  }, []);

  const newConversation = useCallback(() => {
    saveCurrentToHistory();
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsStreaming(false);
    setActiveTools([]);
    setPendingConfirmation(null);
    setCurrentConvId(crypto.randomUUID());
    clearCurrentConv();
  }, [saveCurrentToHistory]);

  const loadConversation = useCallback(
    (id: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;
      saveCurrentToHistory();
      if (abortRef.current) abortRef.current.abort();
      setMessages(conv.messages);
      setCurrentConvId(conv.id);
      setIsStreaming(false);
      setActiveTools([]);
      setPendingConfirmation(null);
      saveCurrentConv(conv.id, conv.messages);
    },
    [conversations, saveCurrentToHistory],
  );

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveConversations(updated);
      return updated;
    });
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    if (messages.length > 0) saveCurrentToHistory();
    setIsOpen(false);
  }, [messages.length, saveCurrentToHistory]);

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
        mode,
        setMode,
        panelWidth,
        setPanelWidth: handleSetPanelWidth,
        conversations,
        newConversation,
        loadConversation,
        deleteConversation,
        pendingConfirmation,
        confirmTools,
        cancelTools,
      }}
    >
      {children}
      <MgicAIButton />
      <MgicAIPanel />
    </MgicAIContext.Provider>
  );
}

function MgicAIButton() {
  const { toggle, isOpen } = useMgicAI();

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
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full bg-white pl-1.5 pr-5 py-1.5 text-sm font-semibold text-foreground shadow-lg ring-1 ring-border/50 transition-shadow hover:shadow-xl"
          aria-label="Abrir Spark"
        >
          <img
            src="/spark-avatar.png"
            alt="Spark"
            className="h-9 w-9 rounded-full object-cover"
          />
          <span className="hidden sm:inline">Spark</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const isDragging = useRef(false);
  const startX = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      startX.current = e.clientX;
      onResize(delta);
    },
    [onResize],
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  return (
    <div
      className="absolute left-0 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center hover:bg-admin/10 active:bg-admin/20"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="h-8 w-0.5 rounded-full bg-border/60" />
    </div>
  );
}

const HEADER_HEIGHT = "calc(3.5rem + 4px)";

function MgicAIPanel() {
  const {
    isOpen,
    close,
    messages,
    sendMessage,
    isStreaming,
    activeTools,
    mode,
    setMode,
    panelWidth,
    setPanelWidth,
    newConversation,
    pendingConfirmation,
    confirmTools,
    cancelTools,
    conversations,
    loadConversation,
    deleteConversation,
  } = useMgicAI();
  const { colorAdmin, studioName } = useBranding();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTools]);

  useEffect(() => {
    if (!isOpen) setShowHistory(false);
  }, [isOpen]);

  const isSidebar = mode === "sidebar";

  const handleResize = useCallback(
    (delta: number) => {
      setPanelWidth(panelWidth + delta);
    },
    [panelWidth, setPanelWidth],
  );

  const panelContent = (
    <div className="relative flex h-full flex-col">
      {/* Resize handle — sidebar mode only, desktop */}
      {isSidebar && (
        <div className="hidden sm:block">
          <ResizeHandle onResize={handleResize} />
        </div>
      )}

      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3"
        style={{ backgroundColor: colorAdmin }}
      >
        <div className="flex items-center gap-2.5">
          <img
            src="/spark-avatar.png"
            alt="Spark"
            className="h-8 w-8 rounded-full object-cover ring-2 ring-white/20"
          />
          <div>
            <h3 className="text-sm font-bold text-white">Spark</h3>
            <p className="text-[10px] text-white/60">COO de {studioName}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={newConversation}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title="Nueva conversación"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
              showHistory
                ? "bg-white/20 text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white",
            )}
            title="Historial"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setMode(isSidebar ? "floating" : "sidebar")}
            className="hidden h-7 w-7 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:flex"
            title={isSidebar ? "Modo flotante" : "Modo sidebar"}
          >
            {isSidebar ? (
              <PanelRightClose className="h-3.5 w-3.5" />
            ) : (
              <PanelRight className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={close}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      {showHistory ? (
        <ConversationListView
          conversations={conversations}
          onSelect={(id) => {
            loadConversation(id);
            setShowHistory(false);
          }}
          onDelete={deleteConversation}
          onBack={() => setShowHistory(false)}
        />
      ) : (
        <>
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
            {pendingConfirmation && (
              <div className="px-5 pb-4">
                <ConfirmationCard
                  tools={pendingConfirmation.tools}
                  onConfirm={confirmTools}
                  onCancel={cancelTools}
                />
              </div>
            )}
          </div>
          <InputBar
            onSend={sendMessage}
            disabled={isStreaming || !!pendingConfirmation}
          />
        </>
      )}
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop only in floating mode */}
          {!isSidebar && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[3px] sm:block"
              onClick={close}
            />
          )}

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className={cn(
              "fixed right-0 flex max-w-full flex-col border-l border-border/50 bg-white",
              isSidebar
                ? "z-30 shadow-sm"
                : "top-0 z-50 h-dvh shadow-2xl",
            )}
            style={{
              width: `${panelWidth}px`,
              ...(isSidebar
                ? { top: HEADER_HEIGHT, height: `calc(100dvh - ${HEADER_HEIGHT})` }
                : {}),
            }}
          >
            {panelContent}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ConversationListView({
  conversations,
  onSelect,
  onDelete,
  onBack,
}: {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}) {
  const { colorAdmin } = useBranding();

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(ts).toLocaleDateString("es", { day: "numeric", month: "short" });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <button
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">Conversaciones</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
          {conversations.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
            <History className="mb-3 h-8 w-8 text-muted/30" />
            <p className="text-sm text-muted">No hay conversaciones anteriores</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface/50"
              >
                <button
                  onClick={() => onSelect(conv.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {conv.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {conv.messages.length} mensajes · {timeAgo(conv.updatedAt)}
                  </p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted/40 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const DEFAULT_SUGGESTIONS = [
  "¿Cómo va la ocupación esta semana?",
  "¿Quiénes son mis clientes en riesgo?",
  "Proponme el horario de la próxima semana",
  "Resumen de ingresos del mes",
  "Crea una clase recurrente de Yoga",
  "¿Qué coach tiene mejor rendimiento?",
];

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  "/admin/availability": [
    "¿Quién puede cubrir Pilates el martes a las 9am si Valentina cancela?",
    "Muéstrame los gaps de cobertura de esta semana",
    "¿Hay solicitudes de ausencia pendientes? ¿Cuál es el impacto?",
    "¿Cuántos coaches están disponibles la semana que viene?",
    "Aprueba las solicitudes pendientes si no dejan clases sin coach",
    "¿Qué coach tiene menos carga esta semana para cubrir un hueco?",
  ],
  "/admin/schedule": [
    "Proponme el horario de la próxima semana",
    "¿Qué clases tienen más lista de espera esta semana?",
    "¿Cuál es el mejor horario para añadir una clase nueva?",
    "Crea 5 clases de Yoga para toda la semana",
    "¿Qué coach está disponible el viernes en la mañana?",
    "Mueve la clase de las 10am al jueves a las 11am",
  ],
  "/admin/coaches": [
    "¿Cuál es el coach con mejor fill rate este mes?",
    "Compara el rendimiento de todos los coaches",
    "¿Qué coach tiene más cancelaciones?",
    "Invita a un nuevo coach al studio",
    "¿Quién tiene menos clases asignadas esta semana?",
    "¿Qué disciplinas cubre cada coach?",
  ],
  "/admin/clients": [
    "¿Quiénes son mis clientes en riesgo de abandono?",
    "¿Cuántos clientes nuevos tenemos este mes?",
    "¿Quiénes son mis clientes VIP?",
    "Da de alta un nuevo cliente",
    "¿Cuál es la tasa de retención este trimestre?",
    "Envía un anuncio a los clientes inactivos",
  ],
  "/admin/classes": [
    "¿Cuál es la clase con mejor ocupación?",
    "¿Qué clases tienen baja asistencia y deberíamos considerar cancelar?",
    "¿Cuál es el fill rate promedio por disciplina?",
    "¿Qué día de la semana tiene mejor asistencia?",
    "Crea una nueva disciplina",
    "¿Hay clases con lista de espera recurrente?",
  ],
  "/admin/packages": [
    "¿Cuál es el paquete más vendido este mes?",
    "Resumen de ingresos por tipo de paquete",
    "¿Cuántos créditos sin usar hay activos?",
    "¿Qué paquetes están por vencer esta semana?",
    "Compara ventas de paquetes vs. mes anterior",
    "¿Cuál es el ticket promedio?",
  ],
  "/admin/feed": [
    "Publica un post motivacional en el feed",
    "Crea un anuncio sobre el horario de esta semana",
    "Publica un post felicitando al coach del mes",
    "Envía un push a todos los miembros activos",
    "Crea un post sobre una clase especial",
    "¿Cuántos likes tiene el último post?",
  ],
  "/admin/analytics": [
    "¿Cómo va el studio comparado con el mes pasado?",
    "¿Cuál es la tendencia de ocupación este trimestre?",
    "¿Qué horarios tienen mejor rendimiento?",
    "Analiza la retención por cohortes",
    "¿Cuál es la proyección de ingresos del mes?",
    "¿Qué día de la semana genera más ingresos?",
  ],
  "/admin/reports": [
    "Dame un resumen ejecutivo del mes",
    "¿Cuáles son los KPIs principales del studio?",
    "Comparativa de este mes vs. el anterior",
    "¿Cuál es la ocupación promedio del trimestre?",
    "Top 5 clases más populares del mes",
    "Resumen de ingresos del trimestre",
  ],
  "/admin/finance": [
    "¿Qué tipo de clase es más rentable hoy?",
    "¿Qué coach genera más ingresos y cuál tiene capacidad desperdiciada?",
    "¿Quiénes son los miembros que pagan pero no vienen? Cuánto MRR hay en riesgo",
    "¿Cuál es la concentración del MRR en mis top 10 miembros?",
    "Analiza la retención por cohortes de los últimos 3 meses",
    "¿En qué horarios debería abrir más clases por demanda insatisfecha?",
    "Proyección de ingresos para cerrar el mes",
    "Revisa los pagos fallidos y sugiere cómo recuperarlos",
  ],
  "/admin/gamification": [
    "¿Cuántos miembros han subido de nivel este mes?",
    "¿Cuál es el logro más desbloqueado?",
    "¿Cuántos miembros tienen nivel avanzado?",
    "Resumen de actividad de gamificación",
    "¿Qué impacto tiene la gamificación en la retención?",
    "¿Cuántos miembros activos participan en logros?",
  ],
  "/admin/shop": [
    "¿Cuál es el producto más vendido?",
    "Resumen de ventas de la tienda este mes",
    "¿Qué productos tienen bajo stock?",
    "¿Cuál es el ticket promedio de la tienda?",
    "Comparativa de ventas vs. mes anterior",
    "¿Qué productos deberíamos destacar?",
  ],
  "/admin/branding": [
    "¿Qué colores usa actualmente el studio?",
    "Dame ideas para mejorar el tagline",
    "¿Cómo se ve la configuración de marca actual?",
    "Sugiere un slogan para una campaña de verano",
    "¿Qué elementos de marca tenemos configurados?",
    "¿Cómo puedo mejorar la presencia del studio?",
  ],
};

function getSuggestionsForPath(pathname: string): string[] {
  const exact = PAGE_SUGGESTIONS[pathname];
  if (exact) return exact;

  for (const [prefix, suggestions] of Object.entries(PAGE_SUGGESTIONS)) {
    if (pathname.startsWith(prefix + "/")) return suggestions;
  }

  return DEFAULT_SUGGESTIONS;
}

function EmptyState({ onSend }: { onSend: (msg: string) => void }) {
  const pathname = usePathname();
  const suggestions = getSuggestionsForPath(pathname);

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <img
        src="/spark-avatar.png"
        alt="Spark"
        className="mb-5 h-16 w-16 rounded-2xl object-cover shadow-sm"
      />
      <h3 className="mb-1 text-lg font-bold text-foreground">Spark</h3>
      <p className="mb-1 text-xs font-medium text-muted/70">Tu COO & copilot del studio</p>
      <p className="mb-8 text-sm leading-relaxed text-muted">
        Conozco tu studio por dentro. Pregúntame lo que sea — datos, acciones, ideas.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSend(s)}
            className={cn(
              "rounded-xl border border-border bg-white px-3.5 py-2",
              "text-[12px] font-medium text-foreground",
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
