import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    if (!hasPermission(ctx.membership.role, "onDemand")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q")?.trim();
    const status = searchParams.get("status");
    const published = searchParams.get("published");

    const videos = await prisma.onDemandVideo.findMany({
      where: {
        tenantId: ctx.tenant.id,
        ...(search && {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }),
        ...(status && ["processing", "ready", "errored"].includes(status) && { status: status as "processing" | "ready" | "errored" }),
        ...(published === "true" && { published: true }),
        ...(published === "false" && { published: false }),
      },
      include: {
        coachProfile: { select: { id: true, name: true } },
        classType: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ videos });
  } catch (err) {
    if (err instanceof Error && (err.message === "Unauthorized" || err.message === "Forbidden")) {
      return NextResponse.json({ error: err.message }, { status: err.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("GET /api/admin/on-demand/videos error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
