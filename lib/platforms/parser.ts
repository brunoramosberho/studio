import Anthropic from "@anthropic-ai/sdk";
import type { PlatformType } from "@prisma/client";

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export type ParsedPlatformEmail = {
  type: "new_booking" | "cancellation" | "unknown";
  className: string | null;
  memberName: string | null;
  date: string | null;
  time: string | null;
  platformBookingId: string | null;
  confidence: "high" | "low";
};

const FALLBACK: ParsedPlatformEmail = {
  type: "unknown",
  className: null,
  memberName: null,
  date: null,
  time: null,
  platformBookingId: null,
  confidence: "low",
};

export async function parsePlatformEmail(
  emailBody: string,
  platform: PlatformType,
): Promise<ParsedPlatformEmail> {
  const platformName =
    platform === "classpass" ? "ClassPass" : "Gympass/Wellhub";

  const client = getAnthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Extrae información de este email de notificación de ${platformName}.
Responde SOLO con JSON válido, sin texto adicional ni markdown.

Formato:
{
  "type": "new_booking" | "cancellation" | "unknown",
  "className": "nombre de la clase o null",
  "memberName": "nombre del miembro que reservó o null",
  "date": "YYYY-MM-DD o null",
  "time": "HH:MM o null",
  "platformBookingId": "ID de reserva o null",
  "confidence": "high" | "low"
}

Email:
${emailBody.slice(0, 2000)}`,
      },
    ],
  });

  try {
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return JSON.parse(text) as ParsedPlatformEmail;
  } catch {
    return { ...FALLBACK };
  }
}
