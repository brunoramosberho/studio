import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

const MAX_RESULTS = 20;

/**
 * Lightweight client search for the POS customer picker and similar
 * pickers. Returns up to 20 matching tenant CLIENTs by name/email substring.
 * Empty `q` returns the 20 most-recently-active members so the dropdown is
 * never empty.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireRole("ADMIN", "FRONT_DESK");
  const tenantId = ctx.tenant.id;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  const memberships = await prisma.membership.findMany({
    where: {
      tenantId,
      role: "CLIENT",
      user: {
        NOT: [
          { email: { contains: "filler" } },
          { email: { contains: "waitlist" } },
        ],
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
    },
    take: MAX_RESULTS,
    orderBy: q
      ? { user: { name: "asc" } }
      : { lastSeenAt: { sort: "desc", nulls: "last" } },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          phone: true,
        },
      },
    },
  });

  return NextResponse.json(
    memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      phone: m.user.phone,
    })),
  );
}
