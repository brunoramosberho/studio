/**
 * Dump every field on the sandbox-revive Tenant row vs another working
 * tenant (lab) to spot what's different.
 */
import { prisma } from "../lib/db";

async function main() {
  const broken = await prisma.tenant.findUnique({
    where: { slug: "sandbox-revive" },
  });
  const working = await prisma.tenant.findUnique({
    where: { slug: "lab" },
  });

  if (!broken || !working) {
    console.error("Tenant(s) missing");
    process.exit(1);
  }

  type AnyRecord = Record<string, unknown>;
  const b = broken as AnyRecord;
  const w = working as AnyRecord;

  const allKeys = new Set([...Object.keys(b), ...Object.keys(w)]);
  console.log(
    `Comparing tenants — broken=sandbox-revive vs working=lab\n`,
  );
  for (const k of [...allKeys].sort()) {
    const bv = JSON.stringify(b[k]);
    const wv = JSON.stringify(w[k]);
    if (bv !== wv) {
      console.log(`  ${k}:`);
      console.log(`    sandbox-revive: ${bv}`);
      console.log(`    lab:            ${wv}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
