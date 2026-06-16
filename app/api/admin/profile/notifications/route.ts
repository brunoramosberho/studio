import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

/** Per-admin notification preferences, stored on the current Membership. */

export async function GET() {
  try {
    const { session, tenant } = await requireRole("FRONT_DESK");
    const m = await prisma.membership.findUnique({
      where: {
        userId_tenantId: { userId: session.user.id, tenantId: tenant.id },
      },
      select: { notifyEmailOnBooking: true },
    });
    return NextResponse.json({
      emailOnBooking: m?.notifyEmailOnBooking ?? false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { session, tenant } = await requireRole("FRONT_DESK");
    const body = await request.json().catch(() => ({}));

    const data: { notifyEmailOnBooking?: boolean } = {};
    if (typeof body.emailOnBooking === "boolean") {
      data.notifyEmailOnBooking = body.emailOnBooking;
    }

    const updated = await prisma.membership.update({
      where: {
        userId_tenantId: { userId: session.user.id, tenantId: tenant.id },
      },
      data,
      select: { notifyEmailOnBooking: true },
    });

    return NextResponse.json({ emailOnBooking: updated.notifyEmailOnBooking });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
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
  console.error("admin/profile/notifications error:", error);
  return NextResponse.json({ error: "Failed" }, { status: 500 });
}
