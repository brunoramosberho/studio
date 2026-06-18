import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";

export async function PATCH(req: Request) {
  try {
    const { tenant } = await requirePermission("marketing");
    const { enabled } = await req.json();

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { highlightsEnabled: !!enabled },
    });

    return NextResponse.json({ highlightsEnabled: !!enabled });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
