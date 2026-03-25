import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenant, getMembership } from "@/lib/tenant";

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

    const membership = await getMembership(session.user.id, tenant.id);

    return NextResponse.json({
      role: membership?.role ?? null,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      isSuperAdmin: (session.user as Record<string, unknown>).isSuperAdmin ?? false,
    });
  } catch {
    return NextResponse.json({ role: null, isSuperAdmin: false });
  }
}
