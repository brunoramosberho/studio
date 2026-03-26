import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

const PACKAGE_TYPES = ["OFFER", "PACK", "SUBSCRIPTION"] as const;

const classTypesInclude = { select: { id: true, name: true } } as const;

const authErrorMessages = [
  "Unauthorized",
  "Forbidden",
  "Not a member of this studio",
  "Tenant not found",
] as const;

function authErrorResponse(error: Error) {
  return NextResponse.json(
    { error: error.message },
    { status: error.message === "Unauthorized" ? 401 : 403 },
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const existing = await prisma.package.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

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
      isActive,
      stripePriceId,
      classTypeIds,
      recurringInterval,
      countryId,
      sortOrder,
    } = body;

    const data: Prisma.PackageUncheckedUpdateInput = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (description !== undefined) {
      data.description =
        description === null || description === "" ? null : String(description);
    }
    if (type !== undefined) {
      if (!PACKAGE_TYPES.includes(type)) {
        return NextResponse.json(
          { error: "type must be OFFER, PACK, or SUBSCRIPTION" },
          { status: 400 },
        );
      }
      data.type = type;
    }
    if (credits !== undefined) {
      if (credits === null) {
        data.credits = null;
      } else {
        const n = typeof credits === "number" ? credits : parseInt(String(credits), 10);
        if (Number.isNaN(n)) {
          return NextResponse.json({ error: "credits must be a number" }, { status: 400 });
        }
        data.credits = n;
      }
    }
    if (validDays !== undefined) {
      const n = typeof validDays === "number" ? validDays : parseInt(String(validDays), 10);
      if (Number.isNaN(n)) {
        return NextResponse.json({ error: "validDays must be a number" }, { status: 400 });
      }
      data.validDays = n;
    }
    if (price !== undefined) {
      const n = typeof price === "number" ? price : parseFloat(String(price));
      if (Number.isNaN(n)) {
        return NextResponse.json({ error: "price must be a number" }, { status: 400 });
      }
      data.price = n;
    }
    if (currency !== undefined) {
      data.currency = currency === null || currency === "" ? "MXN" : String(currency);
    }
    if (isPromo !== undefined) {
      data.isPromo = Boolean(isPromo);
    }
    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }
    if (stripePriceId !== undefined) {
      data.stripePriceId =
        stripePriceId === null || stripePriceId === "" ? null : String(stripePriceId);
    }
    if (recurringInterval !== undefined) {
      data.recurringInterval =
        recurringInterval === null || recurringInterval === ""
          ? null
          : String(recurringInterval);
    }
    if (countryId !== undefined) {
      data.countryId = countryId === null || countryId === "" ? null : String(countryId);
    }
    if (sortOrder !== undefined) {
      const n = typeof sortOrder === "number" ? sortOrder : parseInt(String(sortOrder), 10);
      if (Number.isNaN(n)) {
        return NextResponse.json({ error: "sortOrder must be a number" }, { status: 400 });
      }
      data.sortOrder = n;
    }

    if (classTypeIds !== undefined) {
      if (!Array.isArray(classTypeIds)) {
        return NextResponse.json({ error: "classTypeIds must be an array" }, { status: 400 });
      }
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
      data.classTypes = { set: classTypeIds.map((cid: string) => ({ id: cid })) };
    }

    if (Object.keys(data).length === 0) {
      const unchanged = await prisma.package.findFirst({
        where: { id, tenantId: ctx.tenant.id },
        include: { classTypes: classTypesInclude },
      });
      return NextResponse.json(unchanged);
    }

    const updated = await prisma.package.update({
      where: { id },
      data,
      include: { classTypes: classTypesInclude },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && authErrorMessages.includes(error.message as (typeof authErrorMessages)[number])) {
      return authErrorResponse(error);
    }
    console.error("PUT /api/packages/[id] error:", error);
    return NextResponse.json({ error: "Failed to update package" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const existing = await prisma.package.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    await prisma.package.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && authErrorMessages.includes(error.message as (typeof authErrorMessages)[number])) {
      return authErrorResponse(error);
    }
    console.error("DELETE /api/packages/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete package" }, { status: 500 });
  }
}
