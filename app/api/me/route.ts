import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenant, getMembership } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ role: null, isSuperAdmin: false });
    }

    const tenant = await getTenant();
    if (!tenant) {
      return NextResponse.json({
        role: null,
        isSuperAdmin: (session.user as Record<string, unknown>).isSuperAdmin ?? false,
      });
    }

    const [membership, coachProfile] = await Promise.all([
      getMembership(session.user.id, tenant.id),
      prisma.coachProfile.findUnique({
        where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
        select: { id: true },
      }),
    ]);

    return NextResponse.json({
      role: membership?.role ?? null,
      hasCoachProfile: !!coachProfile,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      isSuperAdmin: (session.user as Record<string, unknown>).isSuperAdmin ?? false,
    });
  } catch {
    return NextResponse.json({ role: null, isSuperAdmin: false });
  }
}
