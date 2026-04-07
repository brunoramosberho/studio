import { NextRequest, NextResponse } from "next/server";
import { PackageType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireTenant, getAuthContext, requireRole } from "@/lib/tenant";
import { ensureStripePrice } from "@/lib/stripe/subscriptions";

const PACKAGE_TYPES = ["OFFER", "PACK", "SUBSCRIPTION"] as const;

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const all = request.nextUrl.searchParams.get("all") === "true";

    if (all) {
      await requireRole("ADMIN");
      const packages = await prisma.package.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
        include: {
          classTypes: { select: { id: true, name: true } },
        },
      });
      return NextResponse.json(packages);
    }

    const authCtx = await getAuthContext();

    let countryFilter = {};
    if (authCtx?.session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: authCtx.session.user.id },
        select: { countryId: true },
      });
      if (user?.countryId) {
        countryFilter = {
          OR: [{ countryId: user.countryId }, { countryId: null }],
        };
      }
    }

    const packages = await prisma.package.findMany({
      where: { isActive: true, tenantId: tenant.id, ...countryFilter },
      orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
      include: {
        classTypes: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(packages);
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(
        error.message,
      )
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("GET /api/packages error:", error);
    return NextResponse.json(
      { error: "Failed to fetch packages" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");

    const body = await request.json();
    const {
      name,
      description,
      type,
      credits,
      validDays,
      price,
      currency,
      isPromo,
      classTypeIds,
      recurringInterval,
      countryId,
      sortOrder,
    } = body;

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (validDays === undefined || validDays === null) {
      return NextResponse.json({ error: "validDays is required" }, { status: 400 });
    }
    const validDaysNum =
      typeof validDays === "number" ? validDays : parseInt(String(validDays), 10);
    if (Number.isNaN(validDaysNum)) {
      return NextResponse.json({ error: "validDays must be a number" }, { status: 400 });
    }
    if (price === undefined || price === null) {
      return NextResponse.json({ error: "price is required" }, { status: 400 });
    }
    const priceNum = typeof price === "number" ? price : parseFloat(String(price));
    if (Number.isNaN(priceNum)) {
      return NextResponse.json({ error: "price must be a number" }, { status: 400 });
    }

    let pkgType: PackageType = PackageType.PACK;
    if (type !== undefined && type !== null) {
      if (!PACKAGE_TYPES.includes(type as PackageType)) {
        return NextResponse.json(
          { error: "type must be OFFER, PACK, or SUBSCRIPTION" },
          { status: 400 },
        );
      }
      pkgType = type as PackageType;
    }

    if (Array.isArray(classTypeIds) && classTypeIds.length > 0) {
      const count = await prisma.classType.count({
        where: {
          id: { in: classTypeIds },
          tenantId: ctx.tenant.id,
        },
      });
      if (count !== classTypeIds.length) {
        return NextResponse.json(
          { error: "One or more class type ids are invalid for this tenant" },
          { status: 400 },
        );
      }
    }

    let creditsVal: number | null = null;
    if (credits !== undefined && credits !== null) {
      const n = typeof credits === "number" ? credits : parseInt(String(credits), 10);
      if (Number.isNaN(n)) {
        return NextResponse.json({ error: "credits must be a number" }, { status: 400 });
      }
      creditsVal = n;
    }

    let sortOrderVal = 0;
    if (sortOrder !== undefined && sortOrder !== null) {
      sortOrderVal =
        typeof sortOrder === "number" ? sortOrder : parseInt(String(sortOrder), 10);
      if (Number.isNaN(sortOrderVal)) {
        return NextResponse.json({ error: "sortOrder must be a number" }, { status: 400 });
      }
    }

    const created = await prisma.package.create({
      data: {
        tenantId: ctx.tenant.id,
        name: name.trim(),
        description:
          description === undefined || description === null || description === ""
            ? null
            : String(description),
        type: pkgType,
        credits: creditsVal,
        validDays: validDaysNum,
        price: priceNum,
        currency: typeof currency === "string" && currency ? currency : "MXN",
        isPromo: Boolean(isPromo),
        recurringInterval:
          recurringInterval === undefined || recurringInterval === null || recurringInterval === ""
            ? null
            : String(recurringInterval),
        countryId:
          countryId === undefined || countryId === null || countryId === ""
            ? null
            : String(countryId),
        sortOrder: sortOrderVal,
        ...(Array.isArray(classTypeIds) && classTypeIds.length > 0
          ? {
              classTypes: {
                connect: classTypeIds.map((id: string) => ({ id })),
              },
            }
          : {}),
      },
      include: {
        classTypes: { select: { id: true, name: true } },
      },
    });

    if (pkgType === PackageType.SUBSCRIPTION && ctx.tenant.stripeAccountId) {
      try {
        await ensureStripePrice(created.id, ctx.tenant.stripeAccountId);
      } catch (e) {
        console.error("Failed to create Stripe Price for subscription:", e);
      }
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(
        error.message,
      )
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("POST /api/packages error:", error);
    return NextResponse.json({ error: "Failed to create package" }, { status: 500 });
  }
}
