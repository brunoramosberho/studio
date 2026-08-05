import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

/**
 * A one-page-per-instructor pay breakdown, meant to be sent to the instructor
 * as-is. The spreadsheet answers "what do I owe everyone this month"; this
 * answers "here's your month, class by class" — the thing a coach actually
 * asks for.
 *
 * Built with pdf-lib rather than a headless browser: no Chromium to install or
 * keep alive on a serverless function, and the waiver PDF already uses it.
 */

export interface StatementLine {
  startsAt: string | Date;
  classTypeName: string;
  studioName: string;
  attendees: number;
  rateLabel: string;
  amount: number;
  isPast: boolean;
}

export interface StatementLabels {
  title: string;
  instructor: string;
  date: string;
  discipline: string;
  studio: string;
  attendees: string;
  rateDetail: string;
  amount: string;
  fixed: string;
  total: string;
  classes: string;
  upcoming: string;
  upcomingLegend: string;
  generated: string;
  note: string;
}

export interface StatementParams {
  studioName: string;
  coachName: string;
  monthLabel: string;
  currency: string;
  locale: string;
  lines: StatementLine[];
  monthlyFixed: number;
  labels: StatementLabels;
  /** Studio brand colour, used sparingly for the header rule and totals. */
  accentHex?: string | null;
  generatedAt?: Date;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Column x-offsets, tuned so a long discipline name has room and the money
// column stays right-aligned against the margin.
const COL = { date: 0, discipline: 62, studio: 197, attendees: 307, rate: 345 };
// Room left for the right-aligned amount, so the rate detail truncates instead
// of colliding with it.
const RATE_MAX_W = 95;

/**
 * Helvetica is WinAnsi-encoded, which covers Spanish accents but throws on
 * anything outside it — an emoji in a discipline name would fail the whole
 * render. Drop what can't be encoded rather than lose the document.
 *
 * The extras matter: € and the typographic dashes and quotes live outside
 * Latin-1 but ARE in WinAnsi, and a naive range strips them. That silently
 * turned every amount into a bare number with no currency at all.
 */
const WINANSI_EXTRAS = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

function safe(text: string): string {
  return Array.from(text ?? "")
    .filter((ch) => {
      const code = ch.codePointAt(0)!;
      if (code >= 0x20 && code <= 0x7e) return true;
      if (code >= 0xa0 && code <= 0xff) return true;
      return WINANSI_EXTRAS.includes(ch);
    })
    .join("");
}

function hexToRgb(hex: string | null | undefined) {
  const clean = (hex ?? "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return rgb(0.11, 0.11, 0.12);
  return rgb(
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  );
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let s = safe(text);
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

export async function buildCoachStatementPdf(params: StatementParams): Promise<Uint8Array> {
  const {
    studioName,
    coachName,
    monthLabel,
    currency,
    locale,
    lines,
    monthlyFixed,
    labels,
    accentHex,
    generatedAt = new Date(),
  } = params;

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(accentHex);
  const ink = rgb(0.11, 0.11, 0.12);
  const soft = rgb(0.45, 0.45, 0.5);
  const hair = rgb(0.89, 0.89, 0.91);

  const money = (n: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-US" : "es-ES", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);

  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-ES", {
    day: "2-digit",
    month: "short",
  });

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const text = (
    s: string,
    x: number,
    size: number,
    font: PDFFont = regular,
    color = ink,
  ) => page.drawText(safe(s), { x: MARGIN + x, y, size, font, color });

  const rightText = (s: string, size: number, font: PDFFont = regular, color = ink) => {
    const str = safe(s);
    page.drawText(str, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(str, size),
      y,
      size,
      font,
      color,
    });
  };

  // ── Header ──────────────────────────────────────────────────────────
  text(studioName, 0, 16, bold, accent);
  rightText(monthLabel, 11, regular, soft);
  y -= 26;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1.5,
    color: accent,
  });

  y -= 30;
  text(labels.title, 0, 20, bold);
  y -= 22;
  text(coachName, 0, 13, regular, soft);

  // ── Summary ─────────────────────────────────────────────────────────
  const classesTotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const grandTotal = classesTotal + monthlyFixed;

  y -= 34;
  page.drawRectangle({
    x: MARGIN,
    y: y - 14,
    width: CONTENT_W,
    height: 44,
    color: rgb(0.97, 0.97, 0.98),
  });
  y += 8;
  text(`${lines.length} ${labels.classes.toLowerCase()}`, 12, 11, regular, soft);
  rightText(money(grandTotal), 18, bold, accent);
  y -= 46;

  // ── Table ───────────────────────────────────────────────────────────
  const header = () => {
    text(labels.date, COL.date, 8, bold, soft);
    text(labels.discipline, COL.discipline, 8, bold, soft);
    text(labels.studio, COL.studio, 8, bold, soft);
    text(labels.attendees, COL.attendees, 8, bold, soft);
    text(labels.rateDetail, COL.rate, 8, bold, soft);
    rightText(labels.amount, 8, bold, soft);
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: hair,
    });
    y -= 14;
  };

  header();

  for (const line of lines) {
    if (y < MARGIN + 90) {
      newPage();
      header();
    }
    const d = new Date(line.startsAt);
    text(dateFmt.format(d), COL.date, 9, regular, line.isPast ? ink : soft);
    // Upcoming classes are greyed rather than tagged: a label here fought the
    // rate column for space and overlapped it. The legend below explains it.
    const rowInk = line.isPast ? ink : soft;
    text(truncate(line.classTypeName, regular, 9, COL.studio - COL.discipline - 8), COL.discipline, 9, regular, rowInk);
    text(truncate(line.studioName, regular, 9, COL.attendees - COL.studio - 8), COL.studio, 9, regular, soft);
    text(String(line.attendees), COL.attendees, 9, regular, soft);
    text(truncate(line.rateLabel, regular, 8, RATE_MAX_W), COL.rate, 8, regular, soft);
    rightText(money(line.amount), 9, regular, rowInk);
    y -= 16;
  }

  // ── Totals ──────────────────────────────────────────────────────────
  if (y < MARGIN + 80) newPage();
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5,
    color: hair,
  });
  y -= 18;

  if (monthlyFixed > 0) {
    text(labels.fixed, COL.date, 10, regular, soft);
    rightText(money(monthlyFixed), 10, regular);
    y -= 18;
  }

  text(labels.total, COL.date, 12, bold);
  rightText(money(grandTotal), 14, bold, accent);

  // ── Footer ──────────────────────────────────────────────────────────
  const hasUpcoming = lines.some((l) => !l.isPast);
  y = MARGIN + (hasUpcoming ? 12 : 0);
  if (hasUpcoming) {
    page.drawText(safe(labels.upcomingLegend), {
      x: MARGIN,
      y,
      size: 7,
      font: regular,
      color: soft,
    });
    y = MARGIN;
  }
  page.drawText(
    safe(`${labels.generated} ${generatedAt.toLocaleDateString(locale === "en" ? "en-US" : "es-ES")} · ${labels.note}`),
    { x: MARGIN, y, size: 7, font: regular, color: soft },
  );

  return pdf.save();
}
