import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

// LoyaltyLevel is global (not tenant-scoped); we still gate the endpoint on
// staff role since this is consumed by the class form (rules editor).
export async function GET() {
  try {
    await requireRole("ADMIN", "FRONT_DESK");

    const levels = await prisma.loyaltyLevel.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true, minClasses: true, icon: true, color: true },
    });

    return NextResponse.json(levels);
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("GET /api/loyalty-levels error:", error);
    return NextResponse.json({ error: "Failed to fetch loyalty levels" }, { status: 500 });
  }
}
