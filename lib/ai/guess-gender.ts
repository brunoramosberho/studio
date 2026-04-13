import Anthropic from "@anthropic-ai/sdk";

const VALID_GENDERS = ["male", "female"] as const;

/**
 * Uses AI to guess gender from a person's first name.
 * Returns "male", "female", or null if uncertain.
 * Fire-and-forget safe — never throws.
 */
export async function guessGenderFromName(
  name: string,
): Promise<"male" | "female" | null> {
  const firstName = name.trim().split(/\s+/)[0];
  if (!firstName || firstName.length < 2) return null;

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: `Given the first name "${firstName}", reply with ONLY "male" or "female". If you are unsure, reply "unknown".`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim().toLowerCase()
        : "";

    if (VALID_GENDERS.includes(text as (typeof VALID_GENDERS)[number])) {
      return text as "male" | "female";
    }
    return null;
  } catch {
    return null;
  }
}
