import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userPackageId, delta } = await request.json();

  if (!userPackageId || typeof delta !== "number") {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const pkg = await prisma.userPackage.findUnique({
    where: { id: userPackageId },
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
