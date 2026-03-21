import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const coaches = await prisma.coachProfile.findMany({
      include: { user: { select: { name: true, email: true, image: true } } },
      orderBy: { user: { name: "asc" } },
    });
    return NextResponse.json(coaches);
  } catch (error) {
    console.error("GET /api/coaches error:", error);
    return NextResponse.json(
      { error: "Failed to fetch coaches" },
      { status: 500 },
    );
  }
}
