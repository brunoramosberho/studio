import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ exists: false });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        name: true,
        packages: {
          where: { expiresAt: { gt: new Date() } },
          select: {
            creditsTotal: true,
            creditsUsed: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ exists: false });
    }

    const hasCredits = user.packages.some(
      (p) => p.creditsTotal === null || p.creditsUsed < (p.creditsTotal ?? 0),
    );

    const totalCredits = user.packages.reduce((sum, p) => {
      if (p.creditsTotal === null) return Infinity;
      return sum + Math.max(0, (p.creditsTotal ?? 0) - p.creditsUsed);
    }, 0);

    return NextResponse.json({
      exists: true,
      hasCredits,
      credits: totalCredits === Infinity ? -1 : totalCredits,
      name: user.name,
    });
  } catch (error) {
    console.error("POST /api/check-email error:", error);
    return NextResponse.json({ exists: false });
  }
}
