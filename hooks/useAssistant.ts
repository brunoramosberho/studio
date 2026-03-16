"use client";

import { useState, useEffect, useCallback } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const STORAGE_KEY = "flo-assistant-messages";
const MAX_USER_MESSAGES = 8;

export function useAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (messages.length > 0) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      }
    } catch {}
  }, [messages]);

  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const remainingMessages = MAX_USER_MESSAGES - userMessageCount;

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming || remainingMessages <= 0 || !content.trim()) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      const withUser = [...messages, userMsg];
      setMessages([...withUser, assistantMsg]);
      setIsStreaming(true);

      try {
        const apiMessages = withUser
          .map((m) => ({ role: m.role, content: m.content }))
          .slice(-8);

        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });

        if (!res.ok) throw new Error("Request failed");
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
            if (!trimmed) continue;

            const jsonStr = trimmed.startsWith("data: ")
              ? trimmed.slice(6)
              : trimmed;

            if (jsonStr === "[DONE]") continue;

            try {
              const data = JSON.parse(jsonStr);
              if (
                data.type === "content_block_delta" &&
                data.delta?.type === "text_delta"
              ) {
                fullText += data.delta.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, content: fullText } : m,
                  ),
                );
              }
            } catch {}
          }
        }

        if (buffer.trim()) {
          const remaining = buffer.trim().startsWith("data: ")
            ? buffer.trim().slice(6)
            : buffer.trim();
          try {
            const data = JSON.parse(remaining);
            if (
              data.type === "content_block_delta" &&
              data.delta?.type === "text_delta"
            ) {
              fullText += data.delta.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: fullText } : m,
                ),
              );
            }
          } catch {}
        }

        if (!fullText) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    content:
                      "No pude generar una respuesta. Intenta de nuevo.",
                  }
                : m,
            ),
          );
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content:
                    "Lo siento, hubo un error. Por favor intenta de nuevo.",
                }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [messages, isStreaming, remainingMessages],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return { messages, sendMessage, isStreaming, remainingMessages, clearChat };
}
