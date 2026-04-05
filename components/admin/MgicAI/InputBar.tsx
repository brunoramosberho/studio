"use client";

import { useState, useRef, useCallback } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";

interface InputBarProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { colorAccent } = useBranding();

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

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="shrink-0 border-t border-zinc-800 px-3 py-3">
      <div className="flex items-end gap-2 rounded-xl bg-zinc-800 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Pregunta algo..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all",
            canSend
              ? "text-white shadow-sm active:scale-95"
              : "bg-zinc-700 text-zinc-500",
          )}
          style={canSend ? { backgroundColor: colorAccent } : undefined}
          aria-label="Enviar mensaje"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-zinc-700">
        AI puede cometer errores. Verifica información importante.
      </p>
    </div>
  );
}
