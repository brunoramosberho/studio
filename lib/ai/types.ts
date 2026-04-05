import type Anthropic from "@anthropic-ai/sdk";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

export interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface ToolCallEvent {
  type: "tool_call";
  tools: string[];
}

export interface TextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface DoneEvent {
  type: "done";
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type StreamEvent = ToolCallEvent | TextDeltaEvent | DoneEvent | ErrorEvent;
