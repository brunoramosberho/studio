import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

type StatusFilter = "upcoming" | "past" | "CANCELLED" | "all";
type SortKey = "startsAt" | "classType" | "coach" | "studio" | "enrolled";
type SortDir = "asc" | "desc";

const PAGE_SIZE_DEFAULT = 12;
const PAGE_SIZE_MAX = 100;

/**
 * Paginated admin classes listing. Replaces the previous pattern where the
 * /admin/classes page fetched every class for the tenant and paginated /
 * filtered / sorted client-side — which broke for tenants with thousands of
 * historical classes.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireRole("ADMIN", "FRONT_DESK");
  const tenantId = ctx.tenant.id;

  const params = request.nextUrl.searchParams;
  const status = (params.get("status") ?? "upcoming") as StatusFilter;
  const search = params.get("search")?.trim() ?? "";
  const sortKey = (params.get("sortKey") ?? "startsAt") as SortKey;
  const sortDir = (params.get("sortDir") ?? "asc") as SortDir;
  const skip = Math.max(0, parseInt(params.get("skip") ?? "0", 10) || 0);
  const take = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, parseInt(params.get("take") ?? `${PAGE_SIZE_DEFAULT}`, 10) || PAGE_SIZE_DEFAULT),
  );

  const now = new Date();

  const where: Prisma.ClassWhereInput = { tenantId };

  switch (status) {
    case "upcoming":
      where.status = "SCHEDULED";
      where.endsAt = { gte: now };
      break;
    case "past":
      where.status = { not: "CANCELLED" };
      where.endsAt = { lt: now };
      break;
    case "CANCELLED":
      where.status = "CANCELLED";
      break;
    case "all":
    default:
      break;
  }

  if (search) {
    where.OR = [
      { classType: { name: { contains: search, mode: "insensitive" } } },
      { coach: { name: { contains: search, mode: "insensitive" } } },
      { tag: { contains: search, mode: "insensitive" } },
      { room: { studio: { name: { contains: search, mode: "insensitive" } } } },
      { room: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.ClassOrderByWithRelationInput =
    sortKey === "classType"
      ? { classType: { name: sortDir } }
      : sortKey === "coach"
        ? { coach: { name: sortDir } }
        : sortKey === "studio"
          ? { room: { studio: { name: sortDir } } }
          : sortKey === "enrolled"
            ? { bookings: { _count: sortDir } }
            : { startsAt: sortDir };

  const [total, upcomingCount, classes] = await Promise.all([
    prisma.class.count({ where }),
    prisma.class.count({
      where: { tenantId, status: "SCHEDULED", endsAt: { gte: now } },
    }),
    prisma.class.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        classType: {
          select: { id: true, name: true, color: true, duration: true },
        },
        room: {
          select: {
            id: true,
            name: true,
            maxCapacity: true,
            studio: {
              select: {
                id: true,
                name: true,
                city: { select: { timezone: true } },
              },
            },
          },
        },
        coach: { select: { id: true, name: true, color: true } },
        _count: {
          select: {
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            waitlist: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    classes,
    total,
    upcomingCount,
    skip,
    take,
    hasMore: skip + classes.length < total,
  });
}
