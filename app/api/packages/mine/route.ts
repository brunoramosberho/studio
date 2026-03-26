import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: session.user!.id! },
      select: { countryId: true },
    });

    const userPackages = await prisma.userPackage.findMany({
      where: {
        userId: session.user!.id!,
        tenantId: tenant.id,
        ...(user?.countryId && {
          package: {
            OR: [{ countryId: user.countryId }, { countryId: null }],
          },
        }),
      },
      include: { package: { include: { classTypes: { select: { id: true, name: true } } } } },
      orderBy: { expiresAt: "asc" },
    });

    return NextResponse.json(userPackages);
  } catch (error) {
    console.error("Error fetching user packages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
