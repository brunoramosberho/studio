/**
 * Backfill signed-waiver PDFs for signatures whose original (fire-and-forget)
 * generation never completed — i.e. WaiverSignature rows with pdfStorageKey
 * null. Everything needed is stored on the row, so we just regenerate + upload.
 *
 * Run against the environment whose DB + Supabase you want to fix:
 *   npx tsx scripts/backfill-waiver-pdfs.ts            # all tenants
 *   npx tsx scripts/backfill-waiver-pdfs.ts betoro     # one tenant (by slug)
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateAndStoreWaiverPdf } from "@/lib/waiver/store-pdf";

async function main() {
  const slug = process.argv[2];

  const where: Prisma.WaiverSignatureWhereInput = { pdfStorageKey: null };
  if (slug) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!tenant) {
      console.error(`Tenant "${slug}" not found`);
      process.exit(1);
    }
    where.tenantId = tenant.id;
  }

  const missing = await prisma.waiverSignature.findMany({
    where,
    select: { id: true, participantName: true },
    orderBy: { signedAt: "asc" },
  });

  console.log(
    `Found ${missing.length} signature(s) without a stored PDF${slug ? ` for "${slug}"` : ""}.`,
  );

  let ok = 0;
  let failed = 0;
  for (const s of missing) {
    try {
      const url = await generateAndStoreWaiverPdf(s.id, { force: true });
      if (url) {
        ok++;
        console.log(`  ✓ ${s.participantName} (${s.id})`);
      } else {
        failed++;
        console.log(`  ✗ ${s.participantName} (${s.id}) — signature not found`);
      }
    } catch (err) {
      failed++;
      console.error(`  ✗ ${s.participantName} (${s.id}):`, err);
    }
  }

  console.log(`\nDone — ${ok} generated, ${failed} failed.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
