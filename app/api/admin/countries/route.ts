import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    await requireRole("ADMIN");

    const body = await request.json();
    const { name, code } = body as { name?: string; code?: string };

    const trimmedName = name?.trim();
    const trimmedCode = code?.trim().toUpperCase();

    if (!trimmedName || !trimmedCode) {
      return NextResponse.json({ error: "name and code are required" }, { status: 400 });
    }
    if (!/^[A-Z]{2}$/.test(trimmedCode)) {
      return NextResponse.json({ error: "code must be a 2-letter ISO code" }, { status: 400 });
    }

    const existing = await prisma.country.findUnique({ where: { code: trimmedCode }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: "Country already exists" }, { status: 409 });
    }

    const country = await prisma.country.create({
      data: { name: trimmedName, code: trimmedCode },
      include: { cities: { orderBy: { name: "asc" } } },
    });

    return NextResponse.json(country, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/countries error:", error);
    return NextResponse.json({ error: "Failed to create country" }, { status: 500 });
  }
}

