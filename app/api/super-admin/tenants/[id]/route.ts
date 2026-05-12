import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            memberships: true,
            classes: true,
            bookings: true,
            userPackages: true,
          },
        },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [revenue, bookingsThisMonth] = await Promise.all([
      prisma.userPackage.aggregate({
        where: { tenantId: id },
        _sum: { creditsTotal: true },
      }),
      prisma.booking.count({
        where: { tenantId: id, createdAt: { gte: startOfMonth } },
      }),
    ]);

    return NextResponse.json({
      ...tenant,
      stats: {
        bookingsThisMonth,
        totalRevenue: revenue._sum.creditsTotal ?? 0,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function PUT(req: Request, { params }: Params) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const body = await req.json();

    const {
      name,
      slug,
      isActive,
      tagline,
      slogan,
      metaDescription,
      logoUrl,
      appIconUrl,
      fontPairing,
      colorBg,
      colorFg,
      colorSurface,
      colorAccent,
      colorAccentSoft,
      colorMuted,
      colorBorder,
      colorHeroBg,
      colorCoach,
      colorAdmin,
      applicationFeePercent,
      saasStripePriceIdOverride,
      stripeSandboxMode,
    } = body;

    if (slug !== undefined && !SLUG_REGEX.test(slug)) {
      return NextResponse.json(
        { error: "El slug solo puede contener letras minúsculas, números y guiones" },
        { status: 400 },
      );
    }

    if (slug !== undefined) {
      const existing = await prisma.tenant.findFirst({
        where: { slug, id: { not: id } },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Ese slug ya está en uso" },
          { status: 409 },
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (slug !== undefined) data.slug = slug;
    if (isActive !== undefined) data.isActive = isActive;
    if (tagline !== undefined) data.tagline = tagline;
    if (slogan !== undefined) data.slogan = slogan;
    if (metaDescription !== undefined) data.metaDescription = metaDescription;
    if (logoUrl !== undefined) data.logoUrl = logoUrl;
    if (appIconUrl !== undefined) data.appIconUrl = appIconUrl;
    if (fontPairing !== undefined) data.fontPairing = fontPairing;
    if (colorBg !== undefined) data.colorBg = colorBg;
    if (colorFg !== undefined) data.colorFg = colorFg;
    if (colorSurface !== undefined) data.colorSurface = colorSurface;
    if (colorAccent !== undefined) data.colorAccent = colorAccent;
    if (colorAccentSoft !== undefined) data.colorAccentSoft = colorAccentSoft;
    if (colorMuted !== undefined) data.colorMuted = colorMuted;
    if (colorBorder !== undefined) data.colorBorder = colorBorder;
    if (colorHeroBg !== undefined) data.colorHeroBg = colorHeroBg;
    if (colorCoach !== undefined) data.colorCoach = colorCoach;
    if (colorAdmin !== undefined) data.colorAdmin = colorAdmin;

    if (applicationFeePercent !== undefined) {
      if (
        typeof applicationFeePercent !== "number" ||
        Number.isNaN(applicationFeePercent) ||
        applicationFeePercent < 0 ||
        applicationFeePercent > 100
      ) {
        return NextResponse.json(
          { error: "applicationFeePercent debe ser un número entre 0 y 100" },
          { status: 400 },
        );
      }
      data.applicationFeePercent = applicationFeePercent;
    }

    if (saasStripePriceIdOverride !== undefined) {
      data.saasStripePriceIdOverride =
        saasStripePriceIdOverride === null ||
        saasStripePriceIdOverride === ""
          ? null
          : String(saasStripePriceIdOverride).trim() || null;
    }

    if (stripeSandboxMode !== undefined) {
      if (typeof stripeSandboxMode !== "boolean") {
        return NextResponse.json(
          { error: "stripeSandboxMode debe ser booleano" },
          { status: 400 },
        );
      }
      data.stripeSandboxMode = stripeSandboxMode;
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data,
    });

    return NextResponse.json(tenant);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(tenant);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
