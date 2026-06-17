import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

// GET /api/admin/discounts/[id]/redemptions — who redeemed this code
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const code = await prisma.discountCode.findFirst({
      where: { id, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    if (!code) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const redemptions = await prisma.discountRedemption.findMany({
      where: { discountCodeId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        userPackageId: true,
        originalAmount: true,
        discountAmount: true,
        finalAmount: true,
        createdAt: true,
      },
    });

    // Resolve the redeeming users (userId is a plain string, no FK).
    const userIds = [
      ...new Set(redemptions.map((r) => r.userId).filter((u): u is string => !!u)),
    ];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, image: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Resolve the purchased package names.
    const pkgIds = [
      ...new Set(
        redemptions.map((r) => r.userPackageId).filter((p): p is string => !!p),
      ),
    ];
    const userPackages = pkgIds.length
      ? await prisma.userPackage.findMany({
          where: { id: { in: pkgIds } },
          select: { id: true, package: { select: { name: true } } },
        })
      : [];
    const pkgMap = new Map(
      userPackages.map((up) => [up.id, up.package?.name ?? null]),
    );

    return NextResponse.json(
      redemptions.map((r) => {
        const u = r.userId ? userMap.get(r.userId) : null;
        return {
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          discountAmount: r.discountAmount,
          finalAmount: r.finalAmount,
          packageName: r.userPackageId
            ? pkgMap.get(r.userPackageId) ?? null
            : null,
          user: r.userId
            ? {
                id: r.userId,
                name: u?.name ?? null,
                email: u?.email ?? null,
                image: u?.image ?? null,
              }
            : null,
        };
      }),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(
        error.message,
      )
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("GET /api/admin/discounts/[id]/redemptions error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
