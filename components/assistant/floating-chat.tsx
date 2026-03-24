"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Sparkles, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";
import { useAssistant } from "@/hooks/useAssistant";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";

const QUICK_QUESTIONS = [
  "¿Qué clase me recomiendas?",
  "¿Cuál es el mejor paquete?",
  "¿Cómo prepararme para mi primera clase?",
];

export function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const { studioName } = useBranding();
  const { messages, sendMessage, isStreaming, remainingMessages, clearChat } =
    useAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleQuickQuestion = (question: string) => {
    sendMessage(question);
  };

  return (
    <>
      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop on mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[2px] md:hidden"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              className={cn(
                "fixed z-50 flex flex-col overflow-hidden bg-background",
                "shadow-[var(--shadow-warm-lg)]",
                "left-0 right-0 bottom-0 max-h-[80dvh] rounded-t-3xl",
                "md:left-auto md:right-6 md:bottom-20 md:w-[380px] md:max-h-[500px] md:rounded-3xl",
              )}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
                    <Sparkles className="h-4 w-4 text-accent" />
                  </div>
                  <h3 className="font-display text-base font-semibold">
                    Asistente {studioName}
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={clearChat}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                      aria-label="Limpiar chat"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                    aria-label="Cerrar chat"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
              >
                {messages.length === 0 ? (
                  <EmptyState onQuickQuestion={handleQuickQuestion} studioName={studioName} />
                ) : (
                  messages.map((msg, i) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isStreaming={isStreaming && i === messages.length - 1}
                    />
                  ))
                )}
              </div>

              {/* Remaining messages indicator */}
              {remainingMessages <= 3 && remainingMessages > 0 && (
                <div className="shrink-0 px-4 pb-1 text-center text-xs text-muted">
                  Quedan {remainingMessages} mensaje
                  {remainingMessages !== 1 && "s"}
                </div>
              )}

              {remainingMessages <= 0 && (
                <div className="shrink-0 px-4 pb-1 text-center text-xs text-muted">
                  Has alcanzado el límite de mensajes.{" "}
                  <button
                    onClick={clearChat}
                    className="text-accent underline underline-offset-2"
                  >
                    Reiniciar
                  </button>
                </div>
              )}

              {/* Input */}
              <div className="shrink-0">
                <ChatInput
                  onSend={sendMessage}
                  disabled={isStreaming || remainingMessages <= 0}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        className={cn(
          "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-accent text-white shadow-[var(--shadow-warm-lift)]",
          "bottom-20 right-4 md:bottom-6 md:right-6",
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? "Cerrar asistente" : "Abrir asistente"}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="h-6 w-6" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageCircle className="h-6 w-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}

function EmptyState({
  onQuickQuestion,
  studioName,
}: {
  onQuickQuestion: (q: string) => void;
  studioName: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" as const }}
      className="flex flex-col items-center px-2 py-6 text-center"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
        <Sparkles className="h-6 w-6 text-accent" />
      </div>
      <p className="mb-1 font-display text-base font-semibold">¡Hola!</p>
      <p className="mb-5 text-sm text-muted">
        Soy tu asistente de {studioName}. ¿En qué puedo ayudarte?
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onQuickQuestion(q)}
            className="rounded-full border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-accent hover:bg-accent/5"
          >
            {q}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
