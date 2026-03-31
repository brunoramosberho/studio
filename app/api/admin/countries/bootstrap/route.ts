import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { BOOTSTRAP_COUNTRIES } from "@/lib/countries";

export async function POST() {
  try {
    await requireRole("ADMIN");

    let created = 0;
    for (const c of BOOTSTRAP_COUNTRIES) {
      const existing = await prisma.country.findUnique({ where: { code: c.code }, select: { id: true } });
      if (existing) continue;
      await prisma.country.create({ data: { code: c.code, name: c.name } });
      created += 1;
    }

    return NextResponse.json({ ok: true, created });
  } catch (error) {
    console.error("POST /api/admin/countries/bootstrap error:", error);
    return NextResponse.json({ error: "Failed to bootstrap countries" }, { status: 500 });
  }
}

