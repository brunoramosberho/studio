import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const vercelCountry = request.headers.get("x-vercel-ip-country");
    const vercelCity = request.headers.get("x-vercel-ip-city");

    if (!vercelCountry) {
      return NextResponse.json({ countryId: null, cityId: null });
    }

    const country = await prisma.country.findFirst({
      where: { code: vercelCountry },
      include: { cities: true },
    });

    if (!country) {
      return NextResponse.json({ countryId: null, cityId: null });
    }

    let matchedCity = country.cities[0] ?? null;

    if (vercelCity && country.cities.length > 1) {
      const normalized = vercelCity.toLowerCase();
      const exact = country.cities.find(
        (c) => c.name.toLowerCase() === normalized,
      );
      if (exact) {
        matchedCity = exact;
      } else {
        const partial = country.cities.find(
          (c) =>
            c.name.toLowerCase().includes(normalized) ||
            normalized.includes(c.name.toLowerCase()),
        );
        if (partial) matchedCity = partial;
      }
    }

    let cityName: string | null = matchedCity?.name ?? null;
    let countryName: string | null = country.name;
    let hasStudios = false;

    if (matchedCity) {
      const tenant = await getTenant();
      if (tenant) {
        const studioCount = await prisma.studio.count({
          where: { cityId: matchedCity.id, tenantId: tenant.id },
        });
        hasStudios = studioCount > 0;
      }
    }

    return NextResponse.json({
      countryId: country.id,
      cityId: matchedCity?.id ?? null,
      cityName,
      countryName,
      hasStudios,
      detected: { country: vercelCountry, city: vercelCity },
    });
  } catch (error) {
    console.error("GET /api/detect-location error:", error);
    return NextResponse.json({ countryId: null, cityId: null });
  }
}
