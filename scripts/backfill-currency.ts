/**
 * Backfill currency/symbol/intl locale on existing Country rows,
 * and wire each Tenant to a defaultCountryId derived from its first Studio.
 *
 * Safe to re-run: all writes are conditional.
 *
 * Run with:
 *   npx tsx scripts/backfill-currency.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COUNTRY_DEFAULTS: Record<
  string,
  { currency: string; currencySymbol: string; intlLocale: string; name?: string }
> = {
  ES: { currency: "EUR", currencySymbol: "€", intlLocale: "es-ES", name: "España" },
  MX: { currency: "MXN", currencySymbol: "$", intlLocale: "es-MX", name: "México" },
  US: { currency: "USD", currencySymbol: "$", intlLocale: "en-US", name: "United States" },
  AR: { currency: "ARS", currencySymbol: "$", intlLocale: "es-AR", name: "Argentina" },
  CO: { currency: "COP", currencySymbol: "$", intlLocale: "es-CO", name: "Colombia" },
  CL: { currency: "CLP", currencySymbol: "$", intlLocale: "es-CL", name: "Chile" },
  PE: { currency: "PEN", currencySymbol: "S/", intlLocale: "es-PE", name: "Perú" },
  GB: { currency: "GBP", currencySymbol: "£", intlLocale: "en-GB", name: "United Kingdom" },
  FR: { currency: "EUR", currencySymbol: "€", intlLocale: "fr-FR", name: "France" },
  PT: { currency: "EUR", currencySymbol: "€", intlLocale: "pt-PT", name: "Portugal" },
  IT: { currency: "EUR", currencySymbol: "€", intlLocale: "it-IT", name: "Italia" },
  DE: { currency: "EUR", currencySymbol: "€", intlLocale: "de-DE", name: "Deutschland" },
};

async function main() {
  console.log("🌍 Backfilling Country currency fields…");

  const countries = await prisma.country.findMany({
    select: { id: true, code: true, currency: true, currencySymbol: true, intlLocale: true },
  });

  let countryUpdates = 0;
  for (const c of countries) {
    const defaults = COUNTRY_DEFAULTS[c.code];
    if (!defaults) {
      console.log(`  ⚠  Unknown country code "${c.code}" — leaving defaults`);
      continue;
    }
    // Only overwrite if the row still holds the schema-level defaults.
    const needsCurrency = c.currency === "EUR" && defaults.currency !== "EUR";
    const needsSymbol = c.currencySymbol === "€" && defaults.currencySymbol !== "€";
    const needsLocale = c.intlLocale === "es-ES" && defaults.intlLocale !== "es-ES";
    if (!needsCurrency && !needsSymbol && !needsLocale) continue;
    await prisma.country.update({
      where: { id: c.id },
      data: {
        currency: defaults.currency,
        currencySymbol: defaults.currencySymbol,
        intlLocale: defaults.intlLocale,
      },
    });
    countryUpdates++;
    console.log(`  ✓ ${c.code} → ${defaults.currency} (${defaults.currencySymbol}, ${defaults.intlLocale})`);
  }
  console.log(`✓ Updated ${countryUpdates} country row(s)\n`);

  console.log("🏢 Linking tenants to their primary country…");

  const tenants = await prisma.tenant.findMany({
    where: { defaultCountryId: null },
    select: {
      id: true,
      slug: true,
      studios: {
        take: 1,
        select: { city: { select: { countryId: true } } },
      },
    },
  });

  let tenantUpdates = 0;
  for (const t of tenants) {
    const countryId = t.studios[0]?.city.countryId;
    if (!countryId) {
      console.log(`  ⚠  Tenant ${t.slug} has no studios — skipped`);
      continue;
    }
    await prisma.tenant.update({
      where: { id: t.id },
      data: { defaultCountryId: countryId },
    });
    tenantUpdates++;
    console.log(`  ✓ ${t.slug} → ${countryId}`);
  }
  console.log(`✓ Updated ${tenantUpdates} tenant row(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
