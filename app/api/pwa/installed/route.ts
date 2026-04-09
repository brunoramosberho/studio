import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { updateLifecycle } from "@/lib/referrals/lifecycle";

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

  updateLifecycle(ctx.session.user.id, ctx.tenant.id, "installed").catch(
    (err) => console.error("Lifecycle update (installed) failed:", err),
  );

  return NextResponse.json({ pwaInstalledAt: membership.pwaInstalledAt });
}
