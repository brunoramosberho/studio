import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BOOTSTRAP_COUNTRIES } from "@/lib/countries";

export async function GET() {
  try {
    // Ensure a stable, fixed country list exists (idempotent, non-destructive).
    // This avoids any manual "setup" and does not touch existing rows.
    await prisma.country.createMany({
      data: BOOTSTRAP_COUNTRIES.map((c) => ({ code: c.code, name: c.name })),
      skipDuplicates: true,
    });

    const countries = await prisma.country.findMany({
      include: {
        cities: {
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(countries);
  } catch (error) {
    console.error("GET /api/locations error:", error);
    return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}
