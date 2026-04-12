import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  findPackageForClass,
  userPackageIncludeForBooking,
} from "@/lib/credits";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const tenantId = ctx.tenant.id;

    const customerId = request.nextUrl.searchParams.get("customerId");
    const classTypeId = request.nextUrl.searchParams.get("classTypeId");

    if (!customerId || !classTypeId) {
      return NextResponse.json(
        { error: "customerId and classTypeId are required" },
        { status: 400 },
      );
    }

    const userPackages = await prisma.userPackage.findMany({
      where: {
        userId: customerId,
        tenantId,
        expiresAt: { gt: new Date() },
      },
      include: userPackageIncludeForBooking,
      orderBy: { expiresAt: "asc" },
    });

    const matchingPackage = findPackageForClass(userPackages, classTypeId);

    if (matchingPackage) {
      const parentPkg = await prisma.userPackage.findUnique({
        where: { id: matchingPackage.id },
        include: { package: { select: { name: true } } },
      });

      return NextResponse.json({
        hasCredits: true,
        packageName: parentPkg?.package.name ?? "Paquete",
        packageId: matchingPackage.id,
      });
    }

    return NextResponse.json({ hasCredits: false });
  } catch (error) {
    console.error("GET /api/admin/pos/customer-credits error:", error);
    return NextResponse.json(
      { error: "Failed to check credits" },
      { status: 500 },
    );
  }
}
