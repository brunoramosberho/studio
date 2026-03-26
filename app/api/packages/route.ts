import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, getAuthContext } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await requireTenant();
    const authCtx = await getAuthContext();

    let countryFilter = {};
    if (authCtx?.session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: authCtx.session.user.id },
        select: { countryId: true },
      });
      if (user?.countryId) {
        countryFilter = {
          OR: [{ countryId: user.countryId }, { countryId: null }],
        };
      }
    }

    const packages = await prisma.package.findMany({
      where: { isActive: true, tenantId: tenant.id, ...countryFilter },
      orderBy: { price: "asc" },
    });

    return NextResponse.json(packages);
  } catch (error) {
    console.error("GET /api/packages error:", error);
    return NextResponse.json(
      { error: "Failed to fetch packages" },
      { status: 500 },
    );
  }
}
