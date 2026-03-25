import Anthropic from "@anthropic-ai/sdk";
import { getServerBranding } from "./branding.server";

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

function buildSystemPrompt(studioName: string) {
  return `You are the ${studioName} Studio assistant. You help clients find the right class for their goals, understand packages, check schedules, and prepare for their first session.

Be warm, encouraging, and concise. Answer in the same language the user writes in.

About ${studioName} Studio:
- Based in Madrid, Spain with studios in Salamanca and Chamberí, plus one in Mexico City
- We offer Reformer Pilates, Mat Flow, and Barre Fusion classes
- Classes run weekdays (7am, 9am, 11am, 6pm, 7:30pm) and weekends (9am, 10:30am, 12pm)
- Packages range from a single class (€9 first-timers) to unlimited monthly (€139)
- Cancellations must be made 12+ hours before class for a credit refund
- We welcome all levels, from complete beginners to advanced practitioners

Available packages:
- Primera Vez: 1 clase, €9 (7 días) — for first-time visitors only
- Clase Individual: 1 clase, €22 (30 días)
- Pack 5 Clases: 5 clases, €95 (60 días)
- Pack 10 Clases: 10 clases, €175 (90 días) — Most popular
- Pack 25 Clases: 25 clases, €399 (180 días)
- Pack 50 Clases: 50 clases, €699 (365 días)
- Ilimitado Mensual: Clases ilimitadas, €139 (30 días)`;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export async function streamAssistantResponse(
  messages: AssistantMessage[],
  scheduleContext?: string,
) {
  const b = await getServerBranding();
  const prompt = buildSystemPrompt(b.studioName);
  const systemContent = scheduleContext
    ? `${prompt}\n\nCurrent schedule:\n${scheduleContext}`
    : prompt;

  const stream = getAnthropic().messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemContent,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  return stream;
}
