import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  const ctx = await requireRole("ADMIN");

  const { userPackageId, delta } = await request.json();

  if (!userPackageId || typeof delta !== "number") {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const pkg = await prisma.userPackage.findFirst({
    where: { id: userPackageId, tenantId: ctx.tenant.id },
  });

  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  if (pkg.creditsTotal === null) {
    return NextResponse.json(
      { error: "Cannot adjust credits on unlimited package" },
      { status: 400 },
    );
  }

  const newUsed = Math.max(0, pkg.creditsUsed - delta);

  const updated = await prisma.userPackage.update({
    where: { id: userPackageId },
    data: { creditsUsed: newUsed },
  });

  return NextResponse.json(updated);
}
