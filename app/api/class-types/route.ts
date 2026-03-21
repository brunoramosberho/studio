import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const types = await prisma.classType.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json(types);
  } catch (error) {
    console.error("GET /api/class-types error:", error);
    return NextResponse.json(
      { error: "Failed to fetch class types" },
      { status: 500 },
    );
  }
}
