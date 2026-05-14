import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

type StatusFilter =
  | "all"
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");

    const status = (request.nextUrl.searchParams.get("status") ||
      "all") as StatusFilter;

    const where = {
      tenantId: tenant.id,
      ...(status !== "all" ? { status } : {}),
    };

    const requests = await prisma.substitutionRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        class: {
          include: {
            classType: { select: { id: true, name: true, color: true } },
            room: {
              select: {
                name: true,
                studio: { select: { name: true } },
              },
            },
          },
        },
        requestingCoach: {
          select: { id: true, name: true, photoUrl: true, color: true },
        },
        originalCoach: {
          select: { id: true, name: true, photoUrl: true, color: true },
        },
        targetCoach: {
          select: { id: true, name: true, photoUrl: true, color: true },
        },
        acceptedByCoach: {
          select: { id: true, name: true, photoUrl: true, color: true },
        },
      },
      take: 200,
    });

    // Summary counts across all statuses (for header badges).
    const counts = await prisma.substitutionRequest.groupBy({
      by: ["status"],
      where: { tenantId: tenant.id },
      _count: { _all: true },
    });
    const byStatus = counts.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

    return NextResponse.json({ requests, counts: byStatus });
  } catch (error) {
    console.error("GET /api/admin/substitutions error:", error);
    return NextResponse.json(
      { error: "Failed to load substitutions" },
      { status: 500 },
    );
  }
}
