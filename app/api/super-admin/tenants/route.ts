import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";

export async function GET() {
  try {
    await requireSuperAdmin();

    const tenants = await prisma.tenant.findMany({
      include: {
        _count: {
          select: {
            memberships: true,
            classes: true,
            bookings: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(tenants);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function POST(req: Request) {
  try {
    await requireSuperAdmin();

    const body = await req.json();
    const { slug, name } = body as { slug?: string; name?: string };

    if (!slug || !name) {
      return NextResponse.json(
        { error: "slug y name son requeridos" },
        { status: 400 },
      );
    }

    if (!SLUG_REGEX.test(slug)) {
      return NextResponse.json(
        { error: "El slug solo puede contener letras minúsculas, números y guiones" },
        { status: 400 },
      );
    }

    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: "Ese slug ya está en uso" },
        { status: 409 },
      );
    }

    const tenant = await prisma.tenant.create({
      data: { slug, name },
    });

    return NextResponse.json(tenant, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
