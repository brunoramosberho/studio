import Anthropic from "@anthropic-ai/sdk";

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

const SYSTEM_PROMPT = `You are the Flō Studio assistant. You help clients find the right class for their goals, understand packages, check schedules, and prepare for their first Pilates session.

Be warm, encouraging, and concise. Answer in the same language the user writes in.

About Flō Studio:
- We offer Reformer Pilates, Mat Flow, and Barre Fusion classes
- Classes run weekdays (7am, 9am, 11am, 6pm, 7:30pm) and weekends (9am, 10:30am, 12pm)
- Packages range from a single class ($150 MXN first-timers) to unlimited monthly ($2,200 MXN)
- Cancellations must be made 12+ hours before class for a credit refund
- We welcome all levels, from complete beginners to advanced practitioners

Available packages:
- Primera Vez: 1 clase, $150 MXN (7 días) — for first-time visitors only
- Clase Individual: 1 clase, $350 MXN (30 días)
- Pack 5 Clases: 5 clases, $1,500 MXN (60 días)
- Pack 10 Clases: 10 clases, $2,800 MXN (90 días) — Most popular
- Pack 25 Clases: 25 clases, $6,500 MXN (180 días)
- Pack 50 Clases: 50 clases, $12,000 MXN (365 días)
- Ilimitado Mensual: Clases ilimitadas, $2,200 MXN (30 días)`;

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export async function streamAssistantResponse(
  messages: AssistantMessage[],
  scheduleContext?: string,
) {
  const systemContent = scheduleContext
    ? `${SYSTEM_PROMPT}\n\nCurrent schedule:\n${scheduleContext}`
    : SYSTEM_PROMPT;

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
