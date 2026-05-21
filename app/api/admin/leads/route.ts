import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");

    const params = request.nextUrl.searchParams;
    const filter = (params.get("filter") ?? "open").toLowerCase();

    const where = {
      tenantId: tenant.id,
      ...(filter === "open" && { convertedUserId: null }),
      ...(filter === "converted" && { convertedUserId: { not: null } }),
    } as const;

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const counts = await prisma.lead.groupBy({
      by: ["convertedUserId"],
      where: { tenantId: tenant.id },
      _count: { _all: true },
    });
    let open = 0;
    let converted = 0;
    for (const c of counts) {
      if (c.convertedUserId === null) open += c._count._all;
      else converted += c._count._all;
    }

    return NextResponse.json({
      leads: leads.map((l) => ({
        id: l.id,
        email: l.email,
        name: l.name,
        phone: l.phone,
        source: l.source,
        convertedAt: l.convertedAt?.toISOString() ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
      counts: { open, converted, total: open + converted },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    if (msg === "Unauthorized")
      return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden")
      return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[admin.leads.list]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
