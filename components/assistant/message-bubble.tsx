"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Message } from "@/hooks/useAssistant";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted"
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut" as const,
          }}
        />
      ))}
    </div>
  );
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const showTyping = !isUser && isStreaming && !message.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" as const }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-2xl rounded-br-md bg-accent text-white"
            : "rounded-2xl rounded-bl-md bg-surface text-foreground",
        )}
      >
        {showTyping ? <TypingIndicator /> : message.content}
      </div>
    </motion.div>
  );
}
