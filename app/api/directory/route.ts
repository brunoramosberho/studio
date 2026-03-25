import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: {
      slug: true,
      name: true,
      tagline: true,
      logoUrl: true,
      colorAccent: true,
      _count: { select: { memberships: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(tenants);
}
