import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await getTenant();
    if (!tenant) {
      return NextResponse.json([]);
    }

    const categories = await prisma.productCategory.findMany({
      where: { tenantId: tenant.id },
      orderBy: { position: "asc" },
      include: {
        products: {
          where: { isActive: true, isVisible: true },
          orderBy: [{ position: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            currency: true,
            imageUrl: true,
            externalUrl: true,
          },
        },
      },
    });

    const filtered = categories.filter((c) => c.products.length > 0);
    return NextResponse.json(filtered);
  } catch (e: unknown) {
    console.error("Shop API error:", e);
    return NextResponse.json([], { status: 200 });
  }
}
