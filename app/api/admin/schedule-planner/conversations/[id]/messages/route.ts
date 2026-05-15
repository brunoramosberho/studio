import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { buildSchedulePlannerPrompt } from "@/lib/ai/schedule-planner/prompt";
import { plannerTools } from "@/lib/ai/schedule-planner/tools";
import { executePlannerTool } from "@/lib/ai/schedule-planner/executor";
import { buildPlannerContext } from "@/lib/ai/schedule-planner/context";
import type {
  PlannerConstraints,
  ScheduleProposal,
} from "@/lib/ai/schedule-planner/types";
import type { StreamEvent } from "@/lib/ai/types";

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function encodeSSE(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireRole("ADMIN");
    const { id: conversationId } = await params;
    const adminFullName = auth.session.user.name || "Admin";
    const adminFirstName = adminFullName.split(" ")[0];

    const body = (await request.json()) as { message: string };
    const userMessage = body.message?.trim();
    if (!userMessage) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const conv = await prisma.schedulePlanConversation.findFirst({
      where: {
        id: conversationId,
        tenantId: auth.tenant.id,
        adminUserId: auth.session.user.id,
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!conv) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Persist user turn before streaming so a dropped connection still keeps
    // history. Title gets stamped from the first user message.
    await prisma.schedulePlanMessage.create({
      data: {
        conversationId,
        role: "user",
        content: userMessage,
      },
    });
    if (conv.messages.length === 0) {
      await prisma.schedulePlanConversation.update({
        where: { id: conversationId },
        data: { title: userMessage.slice(0, 60) },
      });
    }

    const plannerCtx = await buildPlannerContext(auth.tenant.id);
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenant.id },
      select: { name: true },
    });

    const systemPrompt = buildSchedulePlannerPrompt({
      adminFirstName,
      studioName: tenant?.name ?? "el studio",
      studios: plannerCtx.studios,
      classTypes: plannerCtx.classTypes,
      coaches: plannerCtx.coaches,
      currentConstraints: (conv.contextJson ?? null) as PlannerConstraints | null,
      currentProposal: (conv.proposalJson ?? null) as ScheduleProposal | null,
      todayIso: new Date().toISOString().slice(0, 10),
    });

    const history: Anthropic.MessageParam[] = conv.messages.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));
    history.push({ role: "user", content: userMessage });

    const anthropic = getAnthropic();
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const toolNamesUsed = new Set<string>();
        let assistantText = "";
        let proposalEmitted = false;

        try {
          let iteration = 0;
          const MAX_ITERATIONS = 8;

          while (iteration < MAX_ITERATIONS) {
            iteration++;

            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 4096,
              system: [
                {
                  type: "text",
                  text: systemPrompt,
                  cache_control: { type: "ephemeral" },
                },
              ],
              tools: plannerTools,
              messages: history,
            });

            if (response.stop_reason === "tool_use") {
              const toolUseBlocks = response.content.filter(
                (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
              );
              const textBlocks = response.content.filter(
                (b): b is Anthropic.TextBlock => b.type === "text",
              );
              const interimText = textBlocks.map((b) => b.text).join("");
              if (interimText) {
                assistantText += interimText;
                controller.enqueue(
                  encoder.encode(encodeSSE({ type: "text_delta", text: interimText })),
                );
              }

              const toolNames = toolUseBlocks.map((b) => b.name);
              for (const n of toolNames) toolNamesUsed.add(n);
              controller.enqueue(encoder.encode(encodeSSE({ type: "tool_call", tools: toolNames })));

              const toolResults = await Promise.all(
                toolUseBlocks.map(async (block) => {
                  try {
                    const result = await executePlannerTool(
                      block.name,
                      block.input,
                      { tenantId: auth.tenant.id, conversationId },
                    );
                    if (
                      block.name === "propose_schedule_plan" &&
                      result &&
                      typeof result === "object" &&
                      "saved" in result
                    ) {
                      proposalEmitted = true;
                    }
                    return {
                      type: "tool_result" as const,
                      tool_use_id: block.id,
                      content: JSON.stringify(result),
                    };
                  } catch (err) {
                    return {
                      type: "tool_result" as const,
                      tool_use_id: block.id,
                      content: JSON.stringify({
                        error: err instanceof Error ? err.message : "Tool failed",
                      }),
                      is_error: true,
                    };
                  }
                }),
              );

              history.push({ role: "assistant", content: response.content });
              history.push({ role: "user", content: toolResults });
              continue;
            }

            const textBlocks = response.content.filter(
              (b): b is Anthropic.TextBlock => b.type === "text",
            );
            const finalText = textBlocks.map((b) => b.text).join("");

            const CHUNK = 24;
            for (let i = 0; i < finalText.length; i += CHUNK) {
              controller.enqueue(
                encoder.encode(
                  encodeSSE({ type: "text_delta", text: finalText.slice(i, i + CHUNK) }),
                ),
              );
            }
            assistantText += finalText;
            break;
          }

          await prisma.schedulePlanMessage.create({
            data: {
              conversationId,
              role: "assistant",
              content: assistantText || "(sin respuesta)",
              toolsUsed: Array.from(toolNamesUsed),
            },
          });

          if (proposalEmitted) {
            controller.enqueue(
              encoder.encode(encodeSSE({ type: "proposal_ready", conversationId })),
            );
          }
          controller.enqueue(encoder.encode(encodeSSE({ type: "done" })));
        } catch (err) {
          console.error("schedule planner stream error", err);
          const message =
            err instanceof Error && err.message.length < 200
              ? err.message
              : "Ocurrió un error generando la respuesta";
          controller.enqueue(encoder.encode(encodeSSE({ type: "error", message })));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = ["Unauthorized"].includes(message)
      ? 401
      : ["Forbidden", "Not a member of this studio"].includes(message)
        ? 403
        : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
