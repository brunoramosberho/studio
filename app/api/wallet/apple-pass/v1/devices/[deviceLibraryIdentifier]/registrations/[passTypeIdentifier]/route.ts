import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string }>;

/**
 * Returns the serial numbers of passes registered to a device. We return all of
 * the device's serials (a member typically has one) rather than tracking
 * per-pass change tags — Apple then fetches each via the passes endpoint, which
 * always returns the current data. Cheap given one pass per device.
 */
export async function GET(_req: NextRequest, ctx: { params: Params }) {
  const { deviceLibraryIdentifier, passTypeIdentifier } = await ctx.params;

  const regs = await prisma.applePassRegistration.findMany({
    where: { deviceLibraryIdentifier, passTypeIdentifier },
    select: { serialNumber: true },
  });
  if (regs.length === 0) return new NextResponse(null, { status: 204 });

  return NextResponse.json({
    lastUpdated: String(Math.floor(Date.now() / 1000)),
    serialNumbers: regs.map((r) => r.serialNumber),
  });
}
