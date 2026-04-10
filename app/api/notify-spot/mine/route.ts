import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();

    const entries = await prisma.classNotifyMe.findMany({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: { id: true, classId: true },
    });

    return NextResponse.json(entries);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
