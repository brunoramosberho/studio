import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { tools, WRITE_TOOLS } from "@/lib/ai/tools/definitions";
import { executeTool } from "@/lib/ai/tools/executor";
import type { ChatRequest, StreamEvent } from "@/lib/ai/types";

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function getStudioContext(tenantId: string) {
  const [tenant, studios, classTypes, packages, coachCount, memberCount, classCount] =
    await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.studio.findMany({
        where: { tenantId },
        include: { rooms: { select: { name: true } } },
      }),
      prisma.classType.findMany({ where: { tenantId }, select: { name: true } }),
      prisma.package.findMany({
        where: { tenantId, isActive: true },
        select: { name: true, type: true, price: true, credits: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.coachProfile.count({ where: { tenantId } }),
      prisma.membership.count({ where: { tenantId, role: "CLIENT" } }),
      prisma.class.count({
        where: {
          tenantId,
          startsAt: { gte: new Date(Date.now() - 7 * 86400000) },
          status: { not: "CANCELLED" },
        },
      }),
    ]);

  return {
    studioName: tenant?.name ?? "Studio",
    plan: "Pro",
    studios: studios.map((s) => ({ name: s.name, rooms: s.rooms.map((r) => r.name) })),
    disciplines: classTypes.map((ct) => ct.name),
    packages: packages.map((p) => ({
      name: p.name,
      type: p.type,
      price: p.price,
      credits: p.credits,
    })),
    coachCount,
    memberCount,
    classCount,
  };
}

function encodeSSE(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const ctx = await getAuthContext();
    if (!ctx || !ctx.session?.user?.id) {
      return new Response(JSON.stringify({ error: "Inicia sesión para usar Mgic AI" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (ctx.membership.role !== "ADMIN") {
      return new Response(JSON.stringify({ error: "Solo administradores pueden usar Mgic AI" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const tenantId = tenant.id;
    const body: ChatRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const studioCtx = await getStudioContext(tenantId);
    const systemPrompt = buildSystemPrompt(studioCtx);
    const anthropic = getAnthropic();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));

          let iteration = 0;
          const MAX_ITERATIONS = 10;

          while (iteration < MAX_ITERATIONS) {
            iteration++;

            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-5-20250514",
              max_tokens: 4096,
              system: [
                {
                  type: "text",
                  text: systemPrompt,
                  cache_control: { type: "ephemeral" },
                },
              ],
              tools,
              messages,
            });

            if (response.stop_reason === "tool_use") {
              const toolUseBlocks = response.content.filter(
                (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
              );

              const toolNames = toolUseBlocks.map((b) => b.name);
              const hasWriteTool = toolNames.some((n) => WRITE_TOOLS.has(n));

              if (hasWriteTool) {
                const textBlocks = response.content.filter(
                  (b): b is Anthropic.TextBlock => b.type === "text",
                );
                if (textBlocks.length > 0) {
                  controller.enqueue(
                    new TextEncoder().encode(encodeSSE({ type: "text_delta", text: textBlocks.map(b => b.text).join("") })),
                  );
                }
                controller.enqueue(
                  new TextEncoder().encode(encodeSSE({
                    type: "tool_call",
                    tools: toolNames,
                  })),
                );
              } else {
                controller.enqueue(
                  new TextEncoder().encode(encodeSSE({
                    type: "tool_call",
                    tools: toolNames,
                  })),
                );
              }

              const toolResults = await Promise.all(
                toolUseBlocks.map(async (block) => {
                  try {
                    const result = await executeTool(block.name, block.input, tenantId);
                    return {
                      type: "tool_result" as const,
                      tool_use_id: block.id,
                      content: JSON.stringify(result),
                    };
                  } catch (err) {
                    return {
                      type: "tool_result" as const,
                      tool_use_id: block.id,
                      content: JSON.stringify({ error: err instanceof Error ? err.message : "Tool execution failed" }),
                      is_error: true,
                    };
                  }
                }),
              );

              messages.push({ role: "assistant", content: response.content });
              messages.push({ role: "user", content: toolResults });
              continue;
            }

            // Final text response — stream it
            const textBlocks = response.content.filter(
              (b): b is Anthropic.TextBlock => b.type === "text",
            );
            const fullText = textBlocks.map((b) => b.text).join("");

            // Send in chunks to simulate streaming feel
            const CHUNK_SIZE = 20;
            for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
              const chunk = fullText.slice(i, i + CHUNK_SIZE);
              controller.enqueue(
                new TextEncoder().encode(encodeSSE({ type: "text_delta", text: chunk })),
              );
            }

            controller.enqueue(new TextEncoder().encode(encodeSSE({ type: "done" })));
            break;
          }
        } catch (err) {
          console.error("AI chat stream error:", err);
          controller.enqueue(
            new TextEncoder().encode(
              encodeSSE({
                type: "error",
                message: err instanceof Error ? err.message : "Internal error",
              }),
            ),
          );
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const status = ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(message)
      ? message === "Unauthorized" ? 401 : 403
      : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
