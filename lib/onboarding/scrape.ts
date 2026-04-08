const MAX_TEXT_LENGTH = 30_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_EXTRA_PAGES = 5;

const PRIORITY_KEYWORDS = [
  // pricing
  "precio", "precios", "tarifa", "tarifas", "membresia", "membership",
  "paquete", "paquetes", "pack", "packs", "bono", "bonos",
  "pricing", "plans", "suscripcion", "subscription",
  // classes / services
  "clase", "clases", "class", "classes", "servicio", "servicios",
  "service", "services", "entrenamiento", "training", "train",
  "recovery", "programa", "programas", "program", "horario",
  "horarios", "schedule", "timetable",
  // location / about
  "contacto", "contact", "ubicacion", "ubicaciones", "location",
  "locations", "studio", "estudios", "nosotros", "about",
  "quienes-somos", "equipo", "team",
];

const SKIP_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|ico|pdf|mp4|mp3|css|js|woff2?|ttf|eot|zip|xml|json)$/i;
const SKIP_PREFIXES = ["mailto:", "tel:", "javascript:", "whatsapp:", "#"];

async function fetchRawHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MgicBot/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let html = await res.text();

    // Handle JS-only redirects (tiny pages with window.location)
    if (html.length < 500) {
      const jsRedirect = html.match(
        /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/,
      );
      if (jsRedirect?.[1]) {
        const redirectUrl = new URL(jsRedirect[1], url).href;
        const res2 = await fetch(redirectUrl, {
          signal: controller.signal,
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MgicBot/1.0)" },
        });
        if (res2.ok) html = await res2.text();
      }
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}

function extractBrandSignals(html: string): string[] {
  const signals: string[] = [];

  // Extract CSS color declarations (hex, rgb, hsl) from inline styles and <style> blocks
  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/gi) || [];
  const colorSet = new Set<string>();
  const hexRegex = /#[0-9a-fA-F]{6}\b/g;
  for (const block of styleBlocks) {
    let m;
    while ((m = hexRegex.exec(block)) !== null) colorSet.add(m[0]);
  }
  // Also grab inline style colors
  const inlineHex = html.match(/style="[^"]*?(#[0-9a-fA-F]{6})/gi) || [];
  for (const s of inlineHex) {
    const hm = s.match(/#[0-9a-fA-F]{6}/);
    if (hm) colorSet.add(hm[0]);
  }
  // CSS custom properties with color values
  const varColors = html.match(/--[\w-]+:\s*#[0-9a-fA-F]{6}/g) || [];
  for (const v of varColors) signals.push(`[css-var] ${v}`);

  // Theme color meta
  const themeColor = html.match(/<meta\s[^>]*?name\s*=\s*["']theme-color["'][^>]*?content\s*=\s*["']([^"']*)["']/i);
  if (themeColor) signals.push(`[theme-color]: ${themeColor[1]}`);

  if (colorSet.size > 0) {
    const uniqueColors = [...colorSet].slice(0, 20);
    signals.push(`[css-colors-found]: ${uniqueColors.join(", ")}`);
  }

  // Extract logo candidates: <img> with "logo" in src, alt, or class
  const imgRegex = /<img\s[^>]*?src\s*=\s*["']([^"']+)["'][^>]*/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const tag = imgMatch[0].toLowerCase();
    const src = imgMatch[1];
    if (tag.includes("logo") || src.toLowerCase().includes("logo")) {
      signals.push(`[logo-candidate]: ${src}`);
    }
  }

  // og:image
  const ogImage = html.match(/<meta\s[^>]*?property\s*=\s*["']og:image["'][^>]*?content\s*=\s*["']([^"']*)["']/i);
  if (ogImage) signals.push(`[og:image]: ${ogImage[1]}`);

  // favicon / apple-touch-icon
  const iconLink = html.match(/<link\s[^>]*?rel\s*=\s*["'](?:icon|apple-touch-icon)["'][^>]*?href\s*=\s*["']([^"']*)["']/i);
  if (iconLink) signals.push(`[favicon]: ${iconLink[1]}`);

  return signals;
}

function stripHtmlToText(html: string): string {
  // Extract brand signals BEFORE stripping
  const brandSignals = extractBrandSignals(html);

  let text = html;
  // Remove script and style blocks entirely
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  // Preserve key meta tags as readable text
  const metaTags: string[] = [];
  const metaRegex = /<meta\s[^>]*?(?:name|property)\s*=\s*["']([^"']*)["'][^>]*?content\s*=\s*["']([^"']*)["'][^>]*/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    metaTags.push(`[meta ${metaMatch[1]}]: ${metaMatch[2]}`);
  }
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) metaTags.push(`[title]: ${titleMatch[1].trim()}`);
  // Convert tags to whitespace
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(p|div|h[1-6]|li|tr|section|article|header|footer|nav|main)[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ");
  text = text.replace(/&#\d+;/g, " ");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n");
  text = text.trim();
  // Prepend meta info + brand signals
  const header = [
    ...metaTags,
    ...brandSignals,
  ].join("\n");
  return (header ? header + "\n\n" : "") + text;
}

async function fetchPage(url: string): Promise<string> {
  const html = await fetchRawHtml(url);
  const text = stripHtmlToText(html);
  return text.slice(0, MAX_TEXT_LENGTH);
}

function extractInternalLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const links: string[] = [];

  const hrefRegex = /<a\s[^>]*?href\s*=\s*["']([^"'#][^"']*)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const raw = match[1].trim();

    if (SKIP_PREFIXES.some((p) => raw.toLowerCase().startsWith(p))) continue;
    if (SKIP_EXTENSIONS.test(raw)) continue;

    let absolute: URL;
    try {
      absolute = new URL(raw, baseUrl);
    } catch {
      continue;
    }

    if (absolute.hostname !== base.hostname) continue;

    // Normalize: strip hash, trailing slash
    absolute.hash = "";
    const normalized = absolute.href.replace(/\/+$/, "");

    // Skip if same as base or already seen
    const baseNormalized = baseUrl.replace(/\/+$/, "");
    if (normalized === baseNormalized) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    links.push(normalized);
  }

  return links;
}

function scoreLink(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  for (const kw of PRIORITY_KEYWORDS) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

function rankLinks(links: string[]): string[] {
  return links
    .map((url) => ({ url, score: scoreLink(url) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_EXTRA_PAGES)
    .map((entry) => entry.url);
}

export interface ScrapedSite {
  mainHtml: string;
  extraPages: { url: string; html: string }[];
  allLinks: string[];
  selectedLinks: string[];
}

export async function scrapeSite(websiteUrl: string): Promise<ScrapedSite> {
  // 1. Fetch full homepage (links extracted from raw HTML, Claude gets cleaned text)
  const fullHtml = await fetchRawHtml(websiteUrl);
  const mainHtml = stripHtmlToText(fullHtml).slice(0, MAX_TEXT_LENGTH);

  // 2. Extract links from FULL HTML, then rank by keyword relevance
  const allLinks = extractInternalLinks(fullHtml, websiteUrl);
  const selectedLinks = rankLinks(allLinks);

  // 3. Fetch top links in parallel (non-blocking)
  const extraPages: { url: string; html: string }[] = [];

  if (selectedLinks.length > 0) {
    const results = await Promise.allSettled(
      selectedLinks.map((url) => fetchPage(url)),
    );
    results.forEach((result, i) => {
      if (result.status === "fulfilled" && result.value.length > 500) {
        extraPages.push({ url: selectedLinks[i], html: result.value });
      }
    });
  }

  return { mainHtml, extraPages, allLinks, selectedLinks };
}
