import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    await requireRole("ADMIN");

    const body = await request.json();
    const { countryId, name } = body as { countryId?: string; name?: string };

    if (!countryId || !name?.trim()) {
      return NextResponse.json({ error: "countryId and name are required" }, { status: 400 });
    }

    const trimmed = name.trim();

    const existing = await prisma.city.findFirst({
      where: { countryId, name: { equals: trimmed, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "City already exists" }, { status: 409 });
    }

    const city = await prisma.city.create({
      data: { countryId, name: trimmed },
      include: { country: true },
    });

    return NextResponse.json(city, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/cities error:", error);
    return NextResponse.json({ error: "Failed to create city" }, { status: 500 });
  }
}

