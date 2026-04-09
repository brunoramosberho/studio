import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, requireTenant } from "@/lib/tenant";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await requireTenant();
    const { id } = await params;

    const highlight = await prisma.highlight.findFirst({
      where: { id, tenantId: tenant.id, isActive: true },
    });
    if (!highlight) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ctx = await getAuthContext();
    const ua = req.headers.get("user-agent") || null;

    await prisma.highlightClick.create({
      data: {
        highlightId: id,
        userId: ctx?.session?.user?.id || null,
        userName: ctx?.session?.user?.name || null,
        userAgent: ua,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
