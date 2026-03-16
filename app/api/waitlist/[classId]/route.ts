import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const { classId } = await params;

    const waitlist = await prisma.waitlist.findMany({
      where: { classId },
      include: {
        user: { select: { id: true, name: true, image: true, email: true } },
      },
      orderBy: { position: "asc" },
    });

    return NextResponse.json(waitlist);
  } catch (error) {
    console.error("GET /api/waitlist/[classId] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch waitlist" },
      { status: 500 },
    );
  }
}
