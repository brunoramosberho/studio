"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamEvent } from "@/lib/ai/types";
import type { ScheduleProposal } from "@/lib/ai/schedule-planner/types";

export interface PlannerMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  createdAt: string;
}

export interface PlannerConversationSummary {
  id: string;
  title: string;
  status: "GATHERING" | "PROPOSED" | "APPLIED" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
}

interface UseSchedulePlannerReturn {
  conversationId: string | null;
  conversations: PlannerConversationSummary[];
  messages: PlannerMessage[];
  proposal: ScheduleProposal | null;
  activeTools: string[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  startNew: () => Promise<string | null>;
  loadConversation: (id: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  archive: (id: string) => Promise<void>;
  setProposal: (p: ScheduleProposal | null) => void;
  setConversationStatus: (status: "GATHERING" | "PROPOSED" | "APPLIED") => void;
  errorMessage: string | null;
}

export function useSchedulePlanner(): UseSchedulePlannerReturn {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<PlannerConversationSummary[]>([]);
  const [messages, setMessages] = useState<PlannerMessage[]>([]);
  const [proposal, setProposal] = useState<ScheduleProposal | null>(null);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/schedule-planner/conversations");
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: PlannerConversationSummary[] };
      setConversations(data.conversations);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const startNew = useCallback(async () => {
    setErrorMessage(null);
    try {
      const res = await fetch("/api/admin/schedule-planner/conversations", {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || "No se pudo iniciar la conversación");
        return null;
      }
      const data = (await res.json()) as { conversation: PlannerConversationSummary };
      setConversationId(data.conversation.id);
      setMessages([]);
      setProposal(null);
      setActiveTools([]);
      await refreshConversations();
      return data.conversation.id;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Error desconocido");
      return null;
    }
  }, [refreshConversations]);

  const loadConversation = useCallback(async (id: string) => {
    setIsLoadingHistory(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/schedule-planner/conversations/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || "No se pudo cargar la conversación");
        return;
      }
      const data = (await res.json()) as {
        conversation: {
          id: string;
          messages: PlannerMessage[];
          proposalJson: ScheduleProposal | null;
        };
      };
      setConversationId(data.conversation.id);
      setMessages(data.conversation.messages);
      setProposal(data.conversation.proposalJson);
      setActiveTools([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const archive = useCallback(
    async (id: string) => {
      await fetch(`/api/admin/schedule-planner/conversations/${id}`, {
        method: "DELETE",
      });
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
        setProposal(null);
      }
      await refreshConversations();
    },
    [conversationId, refreshConversations],
  );

  const fetchProposal = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/schedule-planner/conversations/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        conversation: { proposalJson: ScheduleProposal | null };
      };
      if (data.conversation.proposalJson) {
        setProposal(data.conversation.proposalJson);
      }
    } catch {
      // ignore
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;
      let activeConvId = conversationId;
      if (!activeConvId) {
        activeConvId = await startNew();
        if (!activeConvId) return;
      }

      setErrorMessage(null);
      const userMsg: PlannerMessage = {
        id: `tmp-user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        createdAt: new Date().toISOString(),
      };
      const assistantMsg: PlannerMessage = {
        id: `tmp-assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setActiveTools([]);

      try {
        abortRef.current = new AbortController();
        const res = await fetch(
          `/api/admin/schedule-planner/conversations/${activeConvId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text.trim() }),
            signal: abortRef.current.signal,
          },
        );
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";
        let proposalReady = false;
        const toolsUsed = new Set<string>();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const raw of lines) {
            const trimmed = raw.trim();
            if (!trimmed.startsWith("data: ")) continue;
            try {
              const event: StreamEvent = JSON.parse(trimmed.slice(6));
              switch (event.type) {
                case "text_delta":
                  fullText += event.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id ? { ...m, content: fullText } : m,
                    ),
                  );
                  break;
                case "tool_call":
                  setActiveTools(event.tools);
                  for (const t of event.tools) toolsUsed.add(t);
                  break;
                case "proposal_ready":
                  proposalReady = true;
                  break;
                case "done":
                  setActiveTools([]);
                  break;
                case "error":
                  setErrorMessage(event.message);
                  break;
              }
            } catch {
              // ignore parse errors
            }
          }
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: fullText || "(sin respuesta)", toolsUsed: Array.from(toolsUsed) }
              : m,
          ),
        );
        if (proposalReady) {
          await fetchProposal(activeConvId);
        }
        refreshConversations();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Error desconocido";
        setErrorMessage(message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: `⚠ ${message}` } : m,
          ),
        );
      } finally {
        setIsStreaming(false);
        setActiveTools([]);
        abortRef.current = null;
      }
    },
    [conversationId, isStreaming, startNew, fetchProposal, refreshConversations],
  );

  const setConversationStatus = useCallback(
    (status: "GATHERING" | "PROPOSED" | "APPLIED") => {
      if (!conversationId) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status } : c)),
      );
    },
    [conversationId],
  );

  return {
    conversationId,
    conversations,
    messages,
    proposal,
    activeTools,
    isStreaming,
    isLoadingHistory,
    startNew,
    loadConversation,
    sendMessage,
    refreshConversations,
    archive,
    setProposal,
    setConversationStatus,
    errorMessage,
  };
}
