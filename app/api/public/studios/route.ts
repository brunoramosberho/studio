import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: {
        slug: true,
        name: true,
        tagline: true,
        logoUrl: true,
        colorAccent: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(tenants);
  } catch {
    return NextResponse.json([]);
  }
}
