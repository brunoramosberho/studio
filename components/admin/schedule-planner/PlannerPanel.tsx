"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Plus,
  History,
  ArrowLeft,
  Trash2,
  Eye,
  Sparkles,
  PanelRight,
  PanelRightClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";
import { useSchedulePlanner, type PlannerMessage } from "@/hooks/useSchedulePlanner";
import { MessageList } from "@/components/admin/MgicAI/MessageList";
import { InputBar } from "@/components/admin/MgicAI/InputBar";
import { ProposalReviewDialog } from "./ProposalReviewDialog";
import { useMgicAI, type AiMessage } from "@/components/admin/MgicAI";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PanelMode = "sidebar" | "floating";

const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 360;
const MAX_PANEL_WIDTH = 700;
const MODE_KEY = "schedule-planner-mode";
const WIDTH_KEY = "schedule-planner-width";
// Matches MgicAI sidebar: panel sits below the admin top bar.
const HEADER_HEIGHT = "calc(3.5rem + 4px)";

export function PlannerPanel({ open, onOpenChange }: Props) {
  const planner = useSchedulePlanner();
  const { studioName, colorAdmin } = useBranding();
  const { setSuppressFab } = useMgicAI();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const lastOpenedProposalAt = useRef<string | null>(null);
  const [mode, setModeState] = useState<PanelMode>("sidebar");
  const [panelWidth, setPanelWidthState] = useState(DEFAULT_PANEL_WIDTH);

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(MODE_KEY) as PanelMode | null;
      if (savedMode === "sidebar" || savedMode === "floating") setModeState(savedMode);
      const savedWidth = localStorage.getItem(WIDTH_KEY);
      if (savedWidth) {
        const w = parseInt(savedWidth, 10);
        if (w >= MIN_PANEL_WIDTH && w <= MAX_PANEL_WIDTH) setPanelWidthState(w);
      }
    } catch {}
  }, []);

  const setMode = useCallback((m: PanelMode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch {}
  }, []);

  const setPanelWidth = useCallback((w: number) => {
    const clamped = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, w));
    setPanelWidthState(clamped);
    try { localStorage.setItem(WIDTH_KEY, String(clamped)); } catch {}
  }, []);

  const handleResize = useCallback(
    (delta: number) => setPanelWidth(panelWidth + delta),
    [panelWidth, setPanelWidth],
  );

  const isSidebar = mode === "sidebar";

  // Auto-open the review modal when a fresh proposal lands.
  useEffect(() => {
    if (!planner.proposal) return;
    if (planner.proposal.generatedAt !== lastOpenedProposalAt.current) {
      lastOpenedProposalAt.current = planner.proposal.generatedAt;
      setReviewOpen(true);
    }
  }, [planner.proposal]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [planner.messages, planner.activeTools]);

  useEffect(() => {
    if (!open) setShowHistory(false);
  }, [open]);

  // Hide the global Spark FAB while the planner is open — it sits at
  // bottom-right and would overlap the planner's input bar.
  useEffect(() => {
    setSuppressFab(open);
    return () => setSuppressFab(false);
  }, [open, setSuppressFab]);

  // Auto-start a new conversation when opening with none active.
  useEffect(() => {
    if (open && !planner.conversationId && !planner.isLoadingHistory) {
      planner.startNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const aiMessages: AiMessage[] = planner.messages.map((m: PlannerMessage) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.createdAt).getTime(),
    toolsUsed: m.toolsUsed,
  }));

  const showProposalBanner =
    planner.proposal && planner.proposal.classes.length > 0 && !reviewOpen;

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop only in floating mode — sidebar mode coexists with the schedule. */}
            {!isSidebar && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[2px]"
                onClick={() => onOpenChange(false)}
              />
            )}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className={cn(
                "fixed right-0 flex max-w-full flex-col border-l border-border/50 bg-card",
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
              {isSidebar && (
                <div className="hidden sm:block">
                  <PlannerResizeHandle onResize={handleResize} />
                </div>
              )}
              <div
                className="flex shrink-0 items-center justify-between px-4 py-3"
                style={{ backgroundColor: colorAdmin }}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src="/spark-avatar.png"
                    alt="Spark"
                    className="h-9 w-9 rounded-full object-cover ring-2 ring-white/20"
                  />
                  <div>
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
                      Spark planea tu horario
                      <Sparkles className="h-3 w-3 text-white/70" />
                    </h3>
                    <p className="text-[11px] text-white/70">
                      Planeación de horario para {studioName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => {
                      planner.startNew();
                      setShowHistory(false);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    title="Nueva planeación"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setShowHistory((v) => !v)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                      showHistory
                        ? "bg-white/20 text-white"
                        : "text-white/70 hover:bg-white/10 hover:text-white",
                    )}
                    title="Historial"
                  >
                    <History className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setMode(isSidebar ? "floating" : "sidebar")}
                    className="hidden h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:flex"
                    title={isSidebar ? "Modo flotante" : "Modo sidebar"}
                  >
                    {isSidebar ? (
                      <PanelRightClose className="h-3.5 w-3.5" />
                    ) : (
                      <PanelRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {showHistory ? (
                <HistoryView
                  conversations={planner.conversations}
                  currentId={planner.conversationId}
                  onSelect={async (id) => {
                    await planner.loadConversation(id);
                    setShowHistory(false);
                  }}
                  onDelete={planner.archive}
                  onBack={() => setShowHistory(false)}
                />
              ) : (
                <>
                  <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50 to-white dark:from-background dark:to-card"
                  >
                    {aiMessages.length === 0 ? (
                      <EmptyState
                        onSend={(t) => planner.sendMessage(t)}
                        isStreaming={planner.isStreaming}
                      />
                    ) : (
                      <MessageList
                        messages={aiMessages}
                        isStreaming={planner.isStreaming}
                        activeTools={planner.activeTools}
                      />
                    )}
                  </div>
                  {planner.errorMessage && (
                    <div className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      ⚠ {planner.errorMessage}
                    </div>
                  )}
                  {showProposalBanner && (
                    <button
                      onClick={() => setReviewOpen(true)}
                      className="flex shrink-0 items-center justify-between gap-2 border-t border-border/50 bg-admin/5 px-4 py-2.5 text-left text-xs font-medium text-admin hover:bg-admin/10"
                    >
                      <span className="flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        Propuesta lista: {planner.proposal!.classes.length} clases
                      </span>
                      <span className="text-[11px] text-muted">Toca para revisar</span>
                    </button>
                  )}
                  <InputBar
                    onSend={(t) => planner.sendMessage(t)}
                    disabled={planner.isStreaming}
                  />
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ProposalReviewDialog
        open={reviewOpen}
        conversationId={planner.conversationId}
        proposal={planner.proposal}
        onOpenChange={setReviewOpen}
        onApplied={() => {
          planner.setProposal(null);
          planner.setConversationStatus("APPLIED");
          planner.refreshConversations();
        }}
      />
    </>
  );
}

function PlannerResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const isDragging = useRef(false);
  const startX = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

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

const PLANNER_QUICK_PROMPTS = [
  "Planéame las próximas 2 semanas para todos los estudios",
  "Arma el horario del próximo mes con énfasis en Pilates",
  "Necesito un horario para una sola sucursal por 10 días",
];

function EmptyState({
  onSend,
  isStreaming,
}: {
  onSend: (text: string) => void;
  isStreaming: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <img
        src="/spark-avatar.png"
        alt="Spark"
        className="mb-4 h-16 w-16 rounded-2xl object-cover shadow-sm"
      />
      <h3 className="mb-1 text-base font-bold text-foreground">¿Listo para armar el horario?</h3>
      <p className="mb-6 max-w-sm text-[13px] leading-relaxed text-muted">
        Cuéntame qué quieres planear y te haré preguntas para entender el contexto: estudios,
        horizonte, disciplinas, restricciones de instructores… y al final propongo el horario
        completo para que lo revises.
      </p>
      <div className="flex w-full flex-col gap-2">
        {PLANNER_QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            disabled={isStreaming}
            onClick={() => onSend(p)}
            className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-[12px] font-medium text-foreground shadow-sm transition-all hover:border-admin/30 hover:shadow-md disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryView({
  conversations,
  currentId,
  onSelect,
  onDelete,
  onBack,
}: {
  conversations: ReturnType<typeof useSchedulePlanner>["conversations"];
  currentId: string | null;
  onSelect: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onBack: () => void;
}) {
  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
  }
  const statusLabel: Record<string, string> = {
    GATHERING: "Recolectando",
    PROPOSED: "Con propuesta",
    APPLIED: "Aplicada",
    ARCHIVED: "Archivada",
  };
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <button
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">Tus planeaciones</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
          {conversations.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
            <History className="mb-3 h-8 w-8 text-muted/30" />
            <p className="text-sm text-muted">Aún no has iniciado planeaciones</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface/50",
                  currentId === conv.id && "bg-admin/5",
                )}
              >
                <button
                  onClick={() => onSelect(conv.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {conv.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {statusLabel[conv.status] ?? conv.status} ·{" "}
                    {conv._count?.messages ?? 0} mensajes · {timeAgo(conv.updatedAt)}
                  </p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted/40 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
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
