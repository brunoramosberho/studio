/**
 * Data migration: Fix city timezones that were set to the old default "America/Mexico_City"
 * when they should have a different timezone based on their country.
 *
 * Run with: npx tsx prisma/migrate-city-timezones.ts
 *
 * Safe to run multiple times (idempotent).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Map of country codes to their primary timezone.
 * Add more entries as needed when expanding to new countries.
 */
const COUNTRY_TIMEZONE: Record<string, string> = {
  ES: "Europe/Madrid",
  MX: "America/Mexico_City",
};

async function main() {
  console.log("Fixing city timezones...\n");

  const cities = await prisma.city.findMany({
    include: { country: { select: { code: true, name: true } } },
  });

  let updated = 0;

  for (const city of cities) {
    const expectedTz = COUNTRY_TIMEZONE[city.country.code];
    if (!expectedTz) {
      console.warn(
        `⚠ No timezone mapping for country "${city.country.name}" (${city.country.code}). Skipping city "${city.name}".`,
      );
      continue;
    }

    if (city.timezone !== expectedTz) {
      await prisma.city.update({
        where: { id: city.id },
        data: { timezone: expectedTz },
      });
      console.log(
        `✓ ${city.name}: "${city.timezone}" → "${expectedTz}"`,
      );
      updated++;
    } else {
      console.log(`  ${city.name}: already "${city.timezone}" ✓`);
    }
  }

  console.log(`\nDone. Updated ${updated} city/cities.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
