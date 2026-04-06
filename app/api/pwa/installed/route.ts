import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function POST() {
  const ctx = await requireAuth();

  const membership = await prisma.membership.update({
    where: {
      userId_tenantId: {
        userId: ctx.session.user.id,
        tenantId: ctx.tenant.id,
      },
    },
    data: {
      pwaInstalledAt: ctx.membership.pwaInstalledAt ?? new Date(),
    },
    select: { pwaInstalledAt: true },
  });

  return NextResponse.json({ pwaInstalledAt: membership.pwaInstalledAt });
}
