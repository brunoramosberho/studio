import type Anthropic from "@anthropic-ai/sdk";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

export interface ConfirmedTool {
  name: string;
  input: Record<string, unknown>;
}

export interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  confirmed_tools?: ConfirmedTool[];
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

export interface ConfirmationRequiredEvent {
  type: "confirmation_required";
  pendingTools: {
    name: string;
    input: Record<string, unknown>;
  }[];
}

export type StreamEvent =
  | ToolCallEvent
  | TextDeltaEvent
  | DoneEvent
  | ErrorEvent
  | ConfirmationRequiredEvent;
