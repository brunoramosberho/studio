import { NextRequest, NextResponse } from "next/server";
import { PackageType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireTenant, getAuthContext, requireRole, getTenantCurrency } from "@/lib/tenant";
import { ensureStripePrice } from "@/lib/stripe/subscriptions";

const PACKAGE_TYPES = ["OFFER", "PACK", "SUBSCRIPTION", "ON_DEMAND_SUBSCRIPTION"] as const;

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const all = request.nextUrl.searchParams.get("all") === "true";

    if (all) {
      // Read-only full catalog. FRONT_DESK needs this to sell packages and
      // memberships from POS (and the schedule class form). Package
      // creation/edits stay ADMIN-only via the POST handler below.
      await requireRole("FRONT_DESK");
      const packages = await prisma.package.findMany({
        where: { tenantId: tenant.id, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
        include: {
          classTypes: { select: { id: true, name: true } },
          creditAllocations: { include: { classType: { select: { id: true, name: true } } } },
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
      where: { isActive: true, deletedAt: null, tenantId: tenant.id, ...countryFilter },
      orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
      include: {
        classTypes: { select: { id: true, name: true } },
        creditAllocations: { include: { classType: { select: { id: true, name: true } } } },
      },
    });

    // Flag packages whose per-customer purchase cap the signed-in buyer has
    // already reached, so the catalog can show them as unavailable instead of
    // letting the buyer tap Buy and hit a 403.
    const userId = authCtx?.session?.user?.id;
    const reached = new Set<string>();
    if (userId) {
      const limited = packages.filter((p) => p.maxPurchasesPerCustomer != null);
      if (limited.length > 0) {
        const owned = await prisma.userPackage.findMany({
          where: {
            userId,
            tenantId: tenant.id,
            packageId: { in: limited.map((p) => p.id) },
            status: { in: ["ACTIVE", "DISPUTED"] },
          },
          select: { packageId: true },
        });
        const counts = new Map<string, number>();
        for (const o of owned) {
          counts.set(o.packageId, (counts.get(o.packageId) ?? 0) + 1);
        }
        for (const p of limited) {
          if ((counts.get(p.id) ?? 0) >= (p.maxPurchasesPerCustomer ?? Infinity)) {
            reached.add(p.id);
          }
        }
      }
    }

    return NextResponse.json(
      packages.map((p) => ({ ...p, purchaseLimitReached: reached.has(p.id) })),
    );
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
      creditAllocations,
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
          { error: "type must be OFFER, PACK, SUBSCRIPTION, or ON_DEMAND_SUBSCRIPTION" },
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

    const hasAllocations = Array.isArray(creditAllocations) && creditAllocations.length > 0;

    function parseOptionalPositiveInt(value: unknown): { ok: true; v: number | null } | { ok: false; error: string } {
      if (value === undefined || value === null || value === "") return { ok: true, v: null };
      const n = typeof value === "number" ? value : parseInt(String(value), 10);
      if (Number.isNaN(n) || n < 1) return { ok: false, error: "must be a positive integer" };
      return { ok: true, v: n };
    }
    const dayLimit = parseOptionalPositiveInt(body.maxBookingsPerDay);
    if (!dayLimit.ok) {
      return NextResponse.json({ error: `maxBookingsPerDay ${dayLimit.error}` }, { status: 400 });
    }
    const concurrentLimit = parseOptionalPositiveInt(body.maxConcurrentUpcomingBookings);
    if (!concurrentLimit.ok) {
      return NextResponse.json({ error: `maxConcurrentUpcomingBookings ${concurrentLimit.error}` }, { status: 400 });
    }
    const perCustomerLimit = parseOptionalPositiveInt(body.maxPurchasesPerCustomer);
    if (!perCustomerLimit.ok) {
      return NextResponse.json({ error: `maxPurchasesPerCustomer ${perCustomerLimit.error}` }, { status: 400 });
    }
    // Limits only make sense for SUBSCRIPTION packages — strip them on other types
    // so the form doesn't accidentally persist leftover values.
    const isSubscription = pkgType === PackageType.SUBSCRIPTION;

    const created = await prisma.package.create({
      data: {
        tenantId: ctx.tenant.id,
        name: name.trim(),
        description:
          description === undefined || description === null || description === ""
            ? null
            : String(description),
        type: pkgType,
        credits: hasAllocations ? null : creditsVal,
        validDays: validDaysNum,
        price: priceNum,
        currency: typeof currency === "string" && currency ? currency : (await getTenantCurrency()).code,
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
        allowGuests: Boolean(body.allowGuests),
        maxGuestsPerBooking: body.maxGuestsPerBooking != null && !Number.isNaN(Number(body.maxGuestsPerBooking)) ? Number(body.maxGuestsPerBooking) : null,
        monthlyGuestPasses: body.monthlyGuestPasses != null && !Number.isNaN(Number(body.monthlyGuestPasses)) ? Number(body.monthlyGuestPasses) : null,
        includesOnDemand:
          pkgType === PackageType.SUBSCRIPTION ? Boolean(body.includesOnDemand) : false,
        maxBookingsPerDay: isSubscription ? dayLimit.v : null,
        maxConcurrentUpcomingBookings: isSubscription ? concurrentLimit.v : null,
        maxPurchasesPerCustomer: perCustomerLimit.v,
        ...(Array.isArray(classTypeIds) && classTypeIds.length > 0
          ? {
              classTypes: {
                connect: classTypeIds.map((id: string) => ({ id })),
              },
            }
          : {}),
        ...(hasAllocations
          ? {
              creditAllocations: {
                create: creditAllocations.map((a: { classTypeId: string; credits: number }) => ({
                  classTypeId: a.classTypeId,
                  credits: a.credits,
                })),
              },
            }
          : {}),
      },
      include: {
        classTypes: { select: { id: true, name: true } },
        creditAllocations: { include: { classType: { select: { id: true, name: true } } } },
      },
    });

    const isRecurring =
      pkgType === PackageType.SUBSCRIPTION || pkgType === PackageType.ON_DEMAND_SUBSCRIPTION;
    if (isRecurring && ctx.tenant.stripeAccountId) {
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
