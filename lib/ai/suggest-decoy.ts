import Anthropic from "@anthropic-ai/sdk";
import { suggestDecoyHeuristic, type DecoyPackage } from "@/lib/packages/decoy";

export interface DecoySuggestion {
  ids: string[];
  recommendedId: string | null;
  explanation: string;
  source: "ai" | "heuristic";
}

/**
 * Spark: proposes a 3-option decoy set (anchor + target + decoy) from the tenant's
 * package catalog using behavioural economics, with a Spanish rationale. Forces a
 * structured tool call so the output is reliable; falls back to the deterministic
 * heuristic if the AI is unavailable or returns something unusable.
 */
export async function suggestDecoyWithAI(
  packages: DecoyPackage[],
  audience: "firstTimer" | "returning",
  currency: string,
): Promise<DecoySuggestion> {
  const fallback = (): DecoySuggestion => ({
    ...suggestDecoyHeuristic(packages, audience),
    explanation:
      "Sugerencia automática por precio y valor por clase (Spark no disponible).",
    source: "heuristic",
  });

  if (packages.length < 2 || !process.env.ANTHROPIC_API_KEY) return fallback();

  const goal =
    audience === "returning"
      ? "a RETURNING customer who already bought before — the studio wants to push them toward the monthly unlimited membership or a bigger commitment"
      : "a FIRST-TIME visitor on their first booking — the studio wants to get them to come back (3+ times), usually via a small multi-class pack, not the unlimited yet";

  const catalog = packages.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    currency,
    classes: p.credits === null ? "unlimited" : p.credits,
    pricePerClass:
      p.credits && p.credits > 0
        ? Math.round((p.price / p.credits) * 100) / 100
        : null,
    type: p.type,
  }));

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      tools: [
        {
          name: "propose_decoy",
          description:
            "Propose a 3-option decoy set (anchor, target, decoy) for the package picker.",
          input_schema: {
            type: "object",
            properties: {
              anchorId: {
                type: "string",
                description: "Low-anchor package id (cheap entry option).",
              },
              targetId: {
                type: "string",
                description:
                  "The preferred pick the studio wants chosen (becomes the 'recommended').",
              },
              decoyId: {
                type: "string",
                description:
                  "Decoy package id: priced at or above the target but clearly worse value, so the target looks obvious.",
              },
              explanation: {
                type: "string",
                description:
                  "2-3 short sentences in Spanish explaining the anchor/target/decoy roles and why this set pushes the target.",
              },
            },
            required: ["anchorId", "targetId", "decoyId", "explanation"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "propose_decoy" },
      messages: [
        {
          role: "user",
          content: `You are a behavioural-economics expert (Dan Ariely's decoy effect / asymmetric dominance). Choose the best 3-option decoy set from this studio's catalog for ${goal}.

The decoy effect needs three roles, in this order:
1. ANCHOR — a cheap entry option so the target feels accessible.
2. TARGET — the option you want them to choose (the "recommended").
3. DECOY — priced at or ABOVE the target but clearly WORSE value (fewer classes or worse price-per-class). Its only job is to make the target the obvious choice.

Return THREE DISTINCT package ids (anchorId, targetId, decoyId) — never the same id twice, never a name in an id field. Your Spanish explanation must describe exactly those three packages by name and match the ids you chose. If no perfect decoy exists, pick the closest. Catalog (prices in ${currency}):
${JSON.stringify(catalog, null, 2)}

Call propose_decoy with three distinct ids from the catalog and a short Spanish explanation that matches them.`,
        },
      ],
    });

    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") {
      const input = toolUse.input as {
        anchorId?: string;
        targetId?: string;
        decoyId?: string;
        explanation?: string;
      };
      const valid = (id?: string) =>
        id && packages.some((p) => p.id === id) ? id : undefined;
      const target = valid(input.targetId);
      const ids = Array.from(
        new Set(
          [valid(input.anchorId), target, valid(input.decoyId)].filter(
            (x): x is string => !!x,
          ),
        ),
      );
      if (target && ids.length >= 2 && input.explanation) {
        return {
          ids,
          recommendedId: target,
          explanation: input.explanation,
          source: "ai",
        };
      }
    }
  } catch (error) {
    console.error("suggestDecoyWithAI error:", error);
  }
  return fallback();
}
