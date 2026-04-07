import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface GeneratePdfParams {
  waiverTitle: string;
  waiverContent: string;
  studioName: string;
  memberName: string;
  phone?: string | null;
  birthDate?: string | null;
  signatureBase64: string;
  signatureHash: string;
  ipAddress: string;
  signedAt: Date;
  waiverVersion: number;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const LINE_HEIGHT = 14;
const MAX_Y = PAGE_HEIGHT - MARGIN;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  fontSize: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, fontSize) > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function generateSignedPdf(
  params: GeneratePdfParams,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = MAX_Y;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = MAX_Y;
    }
  }

  function drawText(
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      indent?: number;
    } = {},
  ) {
    const { size = 10, bold = false, color = rgb(0.1, 0.1, 0.1), indent = 0 } = opts;
    const usedFont = bold ? fontBold : font;
    ensureSpace(size + 4);
    page.drawText(text, {
      x: MARGIN + indent,
      y,
      size,
      font: usedFont,
      color,
    });
    y -= size + 4;
  }

  function drawWrapped(
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
    } = {},
  ) {
    const { size = 10, bold = false, color = rgb(0.1, 0.1, 0.1) } = opts;
    const usedFont = bold ? fontBold : font;
    const lines = wrapText(text, usedFont, size, CONTENT_WIDTH);
    for (const line of lines) {
      if (line === "") {
        y -= LINE_HEIGHT * 0.5;
        continue;
      }
      ensureSpace(LINE_HEIGHT);
      page.drawText(line, {
        x: MARGIN,
        y,
        size,
        font: usedFont,
        color,
      });
      y -= LINE_HEIGHT;
    }
  }

  // Header
  drawText(params.studioName, { size: 9, color: rgb(0.5, 0.5, 0.5) });
  y -= 6;
  drawText(params.waiverTitle, { size: 16, bold: true });
  y -= 4;
  drawText(`Versión ${params.waiverVersion}`, {
    size: 8,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 16;

  // Separator
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 16;

  // Content
  const plainContent = stripHtml(params.waiverContent);
  drawWrapped(plainContent, { size: 10 });
  y -= 20;

  // Participant details
  ensureSpace(80);
  drawText("Datos del participante", { size: 11, bold: true });
  y -= 4;
  drawText(`Nombre: ${params.memberName}`, { size: 10, indent: 4 });
  if (params.phone) {
    drawText(`Teléfono: ${params.phone}`, { size: 10, indent: 4 });
  }
  if (params.birthDate) {
    drawText(`Fecha de nacimiento: ${params.birthDate}`, {
      size: 10,
      indent: 4,
    });
  }
  y -= 16;

  // Signature image
  ensureSpace(120);
  drawText("Firma del participante", { size: 11, bold: true });
  y -= 8;

  try {
    const raw = params.signatureBase64.replace(
      /^data:image\/\w+;base64,/,
      "",
    );
    const imgBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const pngImage = await doc.embedPng(imgBytes);
    const scaled = pngImage.scaleToFit(200, 80);

    page.drawRectangle({
      x: MARGIN,
      y: y - scaled.height - 8,
      width: scaled.width + 16,
      height: scaled.height + 16,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
      color: rgb(0.98, 0.98, 0.98),
    });

    page.drawImage(pngImage, {
      x: MARGIN + 8,
      y: y - scaled.height,
      width: scaled.width,
      height: scaled.height,
    });
    y -= scaled.height + 24;
  } catch {
    drawText("[Firma digital adjunta]", {
      size: 10,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 10;
  }

  y -= 16;

  // Legal footer
  ensureSpace(80);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 12;

  const signedDate = formatDate(params.signedAt);
  const signedTime = formatTime(params.signedAt);
  const hashShort = params.signatureHash.slice(0, 16);

  drawText(
    `Firmado electrónicamente por ${params.memberName} el ${signedDate} a las ${signedTime}`,
    { size: 8, color: rgb(0.4, 0.4, 0.4) },
  );
  drawText(
    `IP: ${params.ipAddress} · Versión: v${params.waiverVersion} · Hash: ${hashShort}…`,
    { size: 8, color: rgb(0.4, 0.4, 0.4) },
  );
  drawText(
    "Válido conforme al Reglamento eIDAS (UE) 910/2014",
    { size: 8, color: rgb(0.4, 0.4, 0.4) },
  );

  return doc.save();
}
