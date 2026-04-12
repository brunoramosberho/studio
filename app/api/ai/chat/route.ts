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
      return new Response(JSON.stringify({ error: "Inicia sesión para usar Spark" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (ctx.membership.role !== "ADMIN") {
      return new Response(JSON.stringify({ error: "Solo administradores pueden usar Spark" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const tenantId = tenant.id;
    const adminUserId = ctx.session.user.id;
    const adminFullName = ctx.session.user.name || "Admin";
    const adminFirstName = adminFullName.split(" ")[0];
    const body: ChatRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const studioCtx = await getStudioContext(tenantId);
    const systemPrompt = buildSystemPrompt({ ...studioCtx, adminFirstName });
    const anthropic = getAnthropic();

    const confirmedTools = body.confirmed_tools;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));

          if (confirmedTools && confirmedTools.length > 0) {
            const results = await Promise.all(
              confirmedTools.map(async (ct) => {
                try {
                  const result = await executeTool(ct.name, ct.input, tenantId, adminUserId);
                  return { name: ct.name, result, error: false };
                } catch (err) {
                  return {
                    name: ct.name,
                    result: { error: err instanceof Error ? err.message : "Execution failed" },
                    error: true,
                  };
                }
              }),
            );

            controller.enqueue(
              new TextEncoder().encode(
                encodeSSE({ type: "tool_call", tools: confirmedTools.map((t) => t.name) }),
              ),
            );

            const toolContext = results
              .map((r) =>
                `[Tool ${r.name} ${r.error ? "FAILED" : "OK"}]: ${JSON.stringify(r.result)}`,
              )
              .join("\n");

            messages.push({
              role: "user" as const,
              content: `El admin confirmó la ejecución. Resultados:\n${toolContext}\n\nResume al admin qué se hizo y el resultado.`,
            });
          }

          let iteration = 0;
          const MAX_ITERATIONS = 10;

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
              tools,
              messages,
            });

            if (response.stop_reason === "tool_use") {
              const toolUseBlocks = response.content.filter(
                (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
              );

              const toolNames = toolUseBlocks.map((b) => b.name);
              const writeTools = toolUseBlocks.filter((b) => WRITE_TOOLS.has(b.name));
              const readTools = toolUseBlocks.filter((b) => !WRITE_TOOLS.has(b.name));

              if (writeTools.length > 0) {
                const textBlocks = response.content.filter(
                  (b): b is Anthropic.TextBlock => b.type === "text",
                );
                if (textBlocks.length > 0) {
                  const text = textBlocks.map((b) => b.text).join("");
                  controller.enqueue(
                    new TextEncoder().encode(encodeSSE({ type: "text_delta", text })),
                  );
                }

                if (readTools.length > 0) {
                  controller.enqueue(
                    new TextEncoder().encode(
                      encodeSSE({ type: "tool_call", tools: readTools.map((b) => b.name) }),
                    ),
                  );

                  const readResults = await Promise.all(
                    readTools.map(async (block) => {
                      try {
                        const result = await executeTool(block.name, block.input, tenantId, adminUserId);
                        return {
                          type: "tool_result" as const,
                          tool_use_id: block.id,
                          content: JSON.stringify(result),
                        };
                      } catch (err) {
                        return {
                          type: "tool_result" as const,
                          tool_use_id: block.id,
                          content: JSON.stringify({ error: err instanceof Error ? err.message : "Failed" }),
                          is_error: true,
                        };
                      }
                    }),
                  );

                  const writeResults = writeTools.map((block) => ({
                    type: "tool_result" as const,
                    tool_use_id: block.id,
                    content: JSON.stringify({ status: "awaiting_admin_confirmation" }),
                  }));

                  messages.push({ role: "assistant", content: response.content });
                  messages.push({ role: "user", content: [...readResults, ...writeResults] });
                }

                controller.enqueue(
                  new TextEncoder().encode(
                    encodeSSE({
                      type: "confirmation_required",
                      pendingTools: writeTools.map((b) => ({
                        name: b.name,
                        input: b.input as Record<string, unknown>,
                      })),
                    }),
                  ),
                );
                controller.enqueue(new TextEncoder().encode(encodeSSE({ type: "done" })));
                break;
              }

              controller.enqueue(
                new TextEncoder().encode(
                  encodeSSE({ type: "tool_call", tools: toolNames }),
                ),
              );

              const toolResults = await Promise.all(
                toolUseBlocks.map(async (block) => {
                  try {
                    const result = await executeTool(block.name, block.input, tenantId, adminUserId);
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

            const textBlocks = response.content.filter(
              (b): b is Anthropic.TextBlock => b.type === "text",
            );
            const fullText = textBlocks.map((b) => b.text).join("");

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
          const rawMsg = err instanceof Error ? err.message : "Internal error";
          const friendlyMsg = rawMsg.includes("model:")
            ? "Error de configuración del modelo AI. Contacta al administrador."
            : rawMsg.length > 200
              ? "Ocurrió un error procesando tu solicitud. Intenta de nuevo."
              : rawMsg;
          controller.enqueue(
            new TextEncoder().encode(
              encodeSSE({ type: "error", message: friendlyMsg }),
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
