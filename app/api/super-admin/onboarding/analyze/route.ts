import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireSuperAdmin } from "@/lib/tenant";
import { EXTRACTION_PROMPT } from "@/lib/onboarding/extraction-prompt";
import { scrapeSite } from "@/lib/onboarding/scrape";
import type { ExtractedData } from "@/lib/onboarding/types";

interface AnalyzeBody {
  websiteUrl: string;
  brandbookBase64?: string | null;
  instagramScreenshots?: { data: string; mediaType: string }[];
  scheduleScreenshots?: { data: string; mediaType: string }[];
  scheduleText?: string | null;
}

function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    await requireSuperAdmin();

    let body: AnalyzeBody;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[onboarding/analyze] JSON parse error:", e);
      return NextResponse.json(
        { error: "Error al leer los datos del formulario. Intenta sin archivos adjuntos." },
        { status: 400 },
      );
    }

    const rawUrl = body.websiteUrl;
    if (!rawUrl) {
      return NextResponse.json(
        { error: "websiteUrl es requerido" },
        { status: 400 },
      );
    }

    const websiteUrl = normalizeUrl(rawUrl);

    // 1. Scrape homepage + discover & fetch relevant internal pages
    let scraped;
    try {
      scraped = await scrapeSite(websiteUrl);
    } catch (e) {
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "No se pudo acceder al sitio (timeout). ¿Está online?"
          : "No se pudo acceder al sitio. ¿La URL es correcta?";
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    const { mainHtml, extraPages } = scraped;

    // 2. Files arrive as base64 from the client
    const brandbookBase64 = body.brandbookBase64 || null;
    const instagramBase64List = (body.instagramScreenshots || []).slice(0, 5);
    const scheduleBase64List = (body.scheduleScreenshots || []).slice(0, 5);
    const scheduleText = body.scheduleText?.trim() || null;

    // 4. Build Claude message content
    const content: Anthropic.Messages.ContentBlockParam[] = [
      {
        type: "text",
        text: `Analiza este sitio web de un estudio de fitness/wellness:\n\n${mainHtml}`,
      },
    ];

    for (const page of extraPages) {
      content.push({
        type: "text",
        text: `Página adicional (${page.url}):\n\n${page.html}`,
      });
    }

    if (brandbookBase64) {
      content.push({
        type: "text",
        text: "A continuación el brandbook/manual de marca del estudio en PDF. Extrae colores de marca, tipografías, y cualquier guideline visual:",
      });
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: brandbookBase64,
        },
      } as Anthropic.Messages.ContentBlockParam);
    }

    if (instagramBase64List.length > 0) {
      content.push({
        type: "text",
        text: `A continuación ${instagramBase64List.length} screenshots del Instagram del estudio. Analiza VISUALMENTE: colores de marca (fondos, acentos, textos), estilo visual, disciplinas mencionadas, y cualquier información sobre el estudio. Los colores que ves repetidamente en estas imágenes SON los colores de la marca:`,
      });
      for (const img of instagramBase64List) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: img.data,
          },
        });
      }
    }

    if (scheduleText) {
      content.push({
        type: "text",
        text: `A continuación el HORARIO SEMANAL de clases del estudio en texto. Extrae cada clase con su día, hora, disciplina, coach y duración. Estos datos van al campo "schedule" del JSON:\n\n${scheduleText}`,
      });
    }

    if (scheduleBase64List.length > 0) {
      content.push({
        type: "text",
        text: `A continuación ${scheduleBase64List.length} screenshots del HORARIO SEMANAL de clases del estudio. Analiza VISUALMENTE la tabla/grid: identifica cada clase, su día, hora, nombre de disciplina, y coach si aparece. Estos datos van al campo "schedule" del JSON:`,
      });
      for (const img of scheduleBase64List) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: img.data,
          },
        });
      }
    }

    content.push({ type: "text", text: EXTRACTION_PROMPT });

    console.log(
      "[onboarding/analyze] Content blocks:",
      content.length,
      "Total text size:",
      content.reduce((s, c) => s + ("text" in c && typeof c.text === "string" ? c.text.length : 0), 0),
    );

    // 5. Call Claude (with retry on overload)
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const callClaude = async (retries = 3): Promise<Anthropic.Messages.Message> => {
      try {
        return await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          messages: [{ role: "user", content }],
        });
      } catch (e) {
        const status = (e as { status?: number }).status;
        if ((status === 529 || status === 503) && retries > 0) {
          console.log(`[onboarding/analyze] API overloaded (${status}), retrying in 3s... (${retries} left)`);
          await new Promise((r) => setTimeout(r, 3000));
          return callClaude(retries - 1);
        }
        throw e;
      }
    };

    let message: Anthropic.Messages.Message;
    try {
      message = await callClaude();
    } catch (e) {
      console.error("[onboarding/analyze] Claude API error:", e);
      const status = (e as { status?: number }).status;
      const friendly = status === 529 || status === 503
        ? "La IA está saturada en este momento. Intenta de nuevo en unos segundos."
        : `Error al comunicarse con la IA (${status || "unknown"})`;
      return NextResponse.json({ error: friendly }, { status: 422 });
    }

    // 6. Parse response
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let extracted: ExtractedData;
    try {
      extracted = JSON.parse(responseText);
    } catch {
      // Retry once with stricter prompt
      try {
        const retryMessage = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          messages: [
            { role: "user", content },
            { role: "assistant", content: responseText },
            {
              role: "user",
              content:
                "Tu respuesta no es JSON válido. Responde ÚNICAMENTE con el JSON, sin texto adicional, sin backticks, sin markdown. Solo el objeto JSON.",
            },
          ],
        });

        const retryText =
          retryMessage.content[0].type === "text"
            ? retryMessage.content[0].text
            : "";

        try {
          extracted = JSON.parse(retryText);
        } catch {
          return NextResponse.json(
            {
              error: "No se pudo obtener una respuesta válida de la IA. Intenta de nuevo.",
              raw: retryText.slice(0, 500),
            },
            { status: 422 },
          );
        }
      } catch (e) {
        console.error("[onboarding/analyze] Claude retry error:", e);
        return NextResponse.json(
          { error: "Error al reintentar con la IA. Intenta de nuevo." },
          { status: 422 },
        );
      }
    }

    // 7. Post-process
    if (extracted.brand) {
      if (extracted.brand.logoUrl && !extracted.brand.logoUrl.startsWith("http")) {
        try {
          extracted.brand.logoUrl = new URL(extracted.brand.logoUrl, websiteUrl).href;
        } catch {
          // leave as-is
        }
      }
      if (!Array.isArray(extracted.brand.secondaryColors)) {
        extracted.brand.secondaryColors = [];
      }
      if (!extracted.brand.accentColor) {
        extracted.brand.accentColor = null;
      }
    }

    if (extracted.identity) {
      extracted.identity.websiteUrl = websiteUrl;
    }

    if (!Array.isArray(extracted.coaches)) {
      extracted.coaches = [];
    }
    if (!Array.isArray(extracted.schedule)) {
      extracted.schedule = [];
    }
    if (extracted.sources) {
      extracted.sources.scheduleScreenshotsAnalyzed = scheduleBase64List.length > 0 || !!scheduleText;
      extracted.sources.scheduleScreenshotsCount = scheduleBase64List.length;
    }
    if (extracted.manualRequired) {
      extracted.manualRequired.schedule = extracted.schedule.length === 0;
    }
    for (const coach of extracted.coaches) {
      if (coach.photoUrl && !coach.photoUrl.startsWith("http")) {
        try {
          coach.photoUrl = new URL(coach.photoUrl, websiteUrl).href;
        } catch {
          coach.photoUrl = null;
        }
      }
      if (!Array.isArray(coach.specialties)) {
        coach.specialties = [];
      }
    }

    return NextResponse.json(extracted);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error interno";
    if (msg === "Unauthorized") {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    console.error("[onboarding/analyze]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
