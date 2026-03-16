"use client";

import { useState, useRef, useCallback } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_CHARS = 500;

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charsLeft = MAX_CHARS - value.length;
  const showCharCount = charsLeft <= 80;
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="border-t border-border/50 px-4 py-3">
      <div className="flex items-end gap-2 rounded-2xl bg-surface px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            if (e.target.value.length <= MAX_CHARS) {
              setValue(e.target.value);
              adjustHeight();
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu mensaje..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200",
            canSend
              ? "bg-accent text-white shadow-sm active:scale-95"
              : "bg-border/50 text-muted",
          )}
          aria-label="Enviar mensaje"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
      {showCharCount && (
        <p
          className={cn(
            "mt-1 text-right text-[11px] tabular-nums",
            charsLeft <= 20 ? "text-destructive" : "text-muted",
          )}
        >
          {charsLeft}
        </p>
      )}
    </div>
  );
}
