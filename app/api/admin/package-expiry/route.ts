import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  const ctx = await requireRole("ADMIN", "FRONT_DESK");

  const { userPackageId, expiresAt } = await request.json();

  if (!userPackageId || typeof expiresAt !== "string") {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const newExpiry = new Date(expiresAt);
  if (Number.isNaN(newExpiry.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const pkg = await prisma.userPackage.findFirst({
    where: { id: userPackageId, tenantId: ctx.tenant.id },
  });

  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  const updated = await prisma.userPackage.update({
    where: { id: userPackageId },
    data: { expiresAt: newExpiry },
  });

  return NextResponse.json(updated);
}
