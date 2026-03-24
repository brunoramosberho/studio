import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

    return NextResponse.json({
      countryId: country.id,
      cityId: matchedCity?.id ?? null,
      detected: { country: vercelCountry, city: vercelCity },
    });
  } catch (error) {
    console.error("GET /api/detect-location error:", error);
    return NextResponse.json({ countryId: null, cityId: null });
  }
}
