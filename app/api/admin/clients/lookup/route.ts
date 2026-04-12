import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const tenantId = ctx.tenant.id;

    const email = request.nextUrl.searchParams.get("email")?.toLowerCase().trim();
    const phone = request.nextUrl.searchParams.get("phone")?.trim();

    if (!email && !phone) {
      return NextResponse.json({ error: "email or phone required" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: email ? { email } : { phone },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,
        memberships: {
          where: { tenantId },
          select: { id: true, role: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ found: false });
    }

    const membership = user.memberships[0] ?? null;

    return NextResponse.json({
      found: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        image: user.image,
      },
      isMember: !!membership,
    });
  } catch (error) {
    console.error("GET /api/admin/clients/lookup error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
