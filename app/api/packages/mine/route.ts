import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { countryId: true },
    });

    const userPackages = await prisma.userPackage.findMany({
      where: {
        userId: session.user.id,
        ...(user?.countryId && {
          package: {
            OR: [{ countryId: user.countryId }, { countryId: null }],
          },
        }),
      },
      include: { package: true },
      orderBy: { expiresAt: "asc" },
    });

    return NextResponse.json(userPackages);
  } catch (error) {
    console.error("Error fetching user packages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
