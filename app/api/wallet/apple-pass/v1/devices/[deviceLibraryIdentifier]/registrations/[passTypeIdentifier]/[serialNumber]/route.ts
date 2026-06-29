import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyApplePassAuthToken } from "@/lib/wallet/config";
import { resolvePassSerial } from "@/lib/wallet/serial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
}>;

function authed(req: NextRequest, serialNumber: string): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^ApplePass\s+/i, "");
  return Boolean(token) && verifyApplePassAuthToken(serialNumber, token);
}

/** Register a device to receive update pushes for a pass. */
export async function POST(req: NextRequest, ctx: { params: Params }) {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await ctx.params;
  if (!authed(req, serialNumber)) return new NextResponse(null, { status: 401 });

  let pushToken = "";
  try {
    pushToken = (await req.json())?.pushToken ?? "";
  } catch {}
  if (!pushToken) return new NextResponse(null, { status: 400 });

  const resolved = await resolvePassSerial(serialNumber);
  if (!resolved) return new NextResponse(null, { status: 404 });

  const existing = await prisma.applePassRegistration.findUnique({
    where: { deviceLibraryIdentifier_serialNumber: { deviceLibraryIdentifier, serialNumber } },
    select: { id: true },
  });

  await prisma.applePassRegistration.upsert({
    where: { deviceLibraryIdentifier_serialNumber: { deviceLibraryIdentifier, serialNumber } },
    create: {
      deviceLibraryIdentifier,
      serialNumber,
      passTypeIdentifier,
      pushToken,
      userId: resolved.userId,
      tenantId: resolved.tenantId,
    },
    update: { pushToken, passTypeIdentifier },
  });

  // 201 Created for a new registration, 200 OK if it already existed.
  return new NextResponse(null, { status: existing ? 200 : 201 });
}

/** Unregister a device. */
export async function DELETE(req: NextRequest, ctx: { params: Params }) {
  const { deviceLibraryIdentifier, serialNumber } = await ctx.params;
  if (!authed(req, serialNumber)) return new NextResponse(null, { status: 401 });

  await prisma.applePassRegistration.deleteMany({
    where: { deviceLibraryIdentifier, serialNumber },
  });
  return new NextResponse(null, { status: 200 });
}
