import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_PROMPT } from "../lib/onboarding/extraction-prompt";
import { scrapeSite } from "../lib/onboarding/scrape";
import type { ExtractedData } from "../lib/onboarding/types";

const TEST_URL = process.argv[2] || "https://revivespain.com";

async function main() {
  console.log(`\n🔍 Scraping ${TEST_URL}...`);
  const scraped = await scrapeSite(TEST_URL);

  console.log(`  ✓ Main page: ${scraped.mainHtml.length} chars`);
  console.log(`  Found ${scraped.allLinks.length} internal links`);
  console.log(`  Selected ${scraped.selectedLinks.length} relevant pages:`);
  for (const url of scraped.selectedLinks) {
    console.log(`    → ${url}`);
  }
  console.log(`  Fetched ${scraped.extraPages.length} extra pages:`);
  for (const page of scraped.extraPages) {
    console.log(`    ✓ ${page.url}: ${page.html.length} chars`);
  }

  const content: Anthropic.Messages.ContentBlockParam[] = [
    {
      type: "text",
      text: `Analiza este sitio web de un estudio de fitness/wellness:\n\n${scraped.mainHtml}`,
    },
    ...scraped.extraPages.map(
      (p) =>
        ({
          type: "text" as const,
          text: `Página adicional (${p.url}):\n\n${p.html}`,
        }),
    ),
    { type: "text", text: EXTRACTION_PROMPT },
  ];

  console.log(`\n🤖 Calling Claude (claude-sonnet-4-20250514)...`);
  const t0 = Date.now();

  const anthropic = new Anthropic();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content }],
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ✓ Response in ${elapsed}s (${message.usage.input_tokens} in / ${message.usage.output_tokens} out)\n`);

  const raw = message.content[0].type === "text" ? message.content[0].text : "";

  let data: ExtractedData;
  try {
    data = JSON.parse(raw);
    console.log("✅ Valid JSON!\n");
  } catch {
    console.error("❌ Invalid JSON from Claude. Raw response:\n");
    console.error(raw.slice(0, 1000));
    process.exit(1);
  }

  console.log("── Identity ──");
  console.log(`  Name:     ${data.identity.name}`);
  console.log(`  Tagline:  ${data.identity.tagline}`);
  console.log(`  Headline: ${data.identity.homeHeadline}`);

  console.log("\n── Brand ──");
  console.log(`  Primary:  ${data.brand.primaryColor}`);
  console.log(`  BG:       ${data.brand.landingBgColor}`);
  console.log(`  Logo:     ${data.brand.logoUrl}`);
  console.log(`  Currency: ${data.brand.currency}`);

  console.log(`\n── Locations (${data.locations.length}) ──`);
  for (const loc of data.locations) {
    console.log(`  • ${loc.name} — ${loc.city} — ${loc.address} [${loc.confidence}]`);
  }

  console.log(`\n── Disciplines (${data.disciplines.length}) ──`);
  for (const d of data.disciplines) {
    console.log(`  • ${d.name} (${d.durationMinutes ?? "?"}min) [${d.confidence}] — ${d.source}`);
  }

  console.log(`\n── Coaches (${(data.coaches || []).length}) ──`);
  for (const c of data.coaches || []) {
    console.log(`  • ${c.name} ${c.photoUrl ? "📷" : ""} [${c.confidence}] — ${c.source}`);
    if (c.specialties.length) console.log(`    Specialties: ${c.specialties.join(", ")}`);
  }

  console.log(`\n── Packages (${data.packages.length}) ──`);
  for (const p of data.packages) {
    const credits = p.unlimited ? "∞" : p.credits ?? "?";
    console.log(`  • ${p.name} — ${p.type} — ${p.price} ${data.brand.currency} — ${credits} créditos [${p.confidence}]`);
  }

  console.log(`\n── Manual Required ──`);
  console.log(`  Notes: ${data.manualRequired.notes}`);

  console.log(`\n── Sources ──`);
  console.log(`  Web: ${data.sources.websiteAnalyzed}, Brandbook: ${data.sources.brandbookAnalyzed}, IG: ${data.sources.instagramAnalyzed}`);

  console.log("\n✅ All good — Claude returned valid, structured JSON.");
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
