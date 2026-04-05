import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BOOTSTRAP_COUNTRIES } from "@/lib/countries";
import { requireTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await requireTenant();

    await prisma.country.createMany({
      data: BOOTSTRAP_COUNTRIES.map((c) => ({ code: c.code, name: c.name })),
      skipDuplicates: true,
    });

    const cityIdsWithStudios = await prisma.studio.findMany({
      where: { tenantId: tenant.id },
      select: { cityId: true },
      distinct: ["cityId"],
    });
    const activeCityIds = new Set(cityIdsWithStudios.map((s) => s.cityId));

    const countries = await prisma.country.findMany({
      include: {
        cities: {
          where: { id: { in: [...activeCityIds] } },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    const filtered = countries.filter((c) => c.cities.length > 0);

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("GET /api/locations error:", error);
    return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}
