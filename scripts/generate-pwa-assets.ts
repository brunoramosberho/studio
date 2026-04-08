/**
 * Generates PWA splash screens and icons for tenants.
 *
 * Usage:
 *   npx tsx scripts/generate-pwa-assets.ts --tenant=betoro
 *   npx tsx scripts/generate-pwa-assets.ts --all
 */

import { generateImages } from "pwa-asset-generator";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const prisma = new PrismaClient();

function buildSourceHtml(tenant: {
  name: string;
  appIconUrl: string | null;
  bgColor: string;
}): string {
  const iconBlock = tenant.appIconUrl
    ? `<img src="${tenant.appIconUrl}" style="width:180px;height:180px;border-radius:36px;object-fit:contain;" />`
    : `<div style="width:180px;height:180px;border-radius:36px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;">
        <span style="color:white;font-size:80px;font-weight:700;font-family:-apple-system,sans-serif;">${tenant.name
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
          .toUpperCase()}</span>
      </div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;width:100vw;height:100vh;background:${tenant.bgColor};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;">
  ${iconBlock}
  <span style="color:white;font-size:28px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:0.5px;">${tenant.name}</span>
</body>
</html>`;
}

async function generateForTenant(slug: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      slug: true,
      name: true,
      colorAccent: true,
      colorHeroBg: true,
      appIconUrl: true,
    },
  });

  if (!tenant) {
    throw new Error(`Tenant "${slug}" not found`);
  }

  const outputDir = path.resolve("public", "pwa", tenant.slug);
  fs.mkdirSync(outputDir, { recursive: true });

  const bgColor = tenant.colorHeroBg || "#1C1917";

  // Write a temp HTML file as the source for pwa-asset-generator
  const tmpHtml = path.join(os.tmpdir(), `pwa-source-${tenant.slug}.html`);
  fs.writeFileSync(tmpHtml, buildSourceHtml({ name: tenant.name, appIconUrl: tenant.appIconUrl, bgColor }));

  console.log(`⏳ Generating PWA assets for "${tenant.name}" (${tenant.slug})...`);
  console.log(`   Background: ${bgColor}`);
  console.log(`   Icon source: ${tenant.appIconUrl ? "appIconUrl" : "fallback initials"}`);
  console.log(`   Output: ${outputDir}`);

  const { savedImages, htmlMeta } = await generateImages(tmpHtml, outputDir, {
    splashOnly: false,
    iconOnly: false,
    background: bgColor,
    padding: "0",
    type: "png",
    quality: 100,
    portraitOnly: true,
    log: false,
    scrape: false,
  });

  // Cleanup temp file
  fs.unlinkSync(tmpHtml);

  console.log(`   ✓ Generated ${savedImages.length} images`);

  const metaPath = path.join(outputDir, "splash-meta.json");
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tenant: tenant.slug,
        images: savedImages.map((img) => ({
          name: path.basename(img.path),
          width: img.width,
          height: img.height,
        })),
        htmlMeta,
      },
      null,
      2,
    ),
  );

  console.log(`   ✓ Metadata saved to ${metaPath}`);
  console.log(`✅ Done: ${tenant.slug}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const tenantArg = args.find((a) => a.startsWith("--tenant="))?.split("=")[1];
  const allTenants = args.includes("--all");

  if (!tenantArg && !allTenants) {
    console.error("Usage:");
    console.error("  npx tsx scripts/generate-pwa-assets.ts --tenant=betoro");
    console.error("  npx tsx scripts/generate-pwa-assets.ts --all");
    process.exit(1);
  }

  try {
    if (allTenants) {
      const tenants = await prisma.tenant.findMany({
        where: { isActive: true },
        select: { slug: true },
        orderBy: { name: "asc" },
      });
      console.log(`\n🏗️  Generating PWA assets for ${tenants.length} tenants...\n`);
      for (const t of tenants) {
        await generateForTenant(t.slug);
      }
      console.log(`🎉 All ${tenants.length} tenants complete!`);
    } else if (tenantArg) {
      console.log("");
      await generateForTenant(tenantArg);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
