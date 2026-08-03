import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

/**
 * Block or unblock a member at this studio.
 *
 * ADMIN only — front desk can check people in, not decide who stops being a
 * client. The block lives on the membership, so it never follows the person to
 * another studio on the platform.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id: userId } = await params;
    const body = await request.json();
    const blocked = body.blocked === true;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: ctx.tenant.id } },
      select: { id: true, role: true, userId: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // Staff are removed from the team, not blocked as clients — otherwise an
    // admin could lock a colleague out of the panel from the client screen,
    // where none of that context is visible.
    if (membership.role !== "CLIENT") {
      return NextResponse.json({ error: "not_a_client" }, { status: 400 });
    }
    if (membership.userId === ctx.session.user.id) {
      return NextResponse.json({ error: "cannot_block_self" }, { status: 400 });
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: blocked
        ? {
            blockedAt: new Date(),
            blockedReason: reason || null,
            blockedById: ctx.session.user.id,
          }
        : { blockedAt: null, blockedReason: null, blockedById: null },
      select: { blockedAt: true, blockedReason: true },
    });

    return NextResponse.json({
      blockedAt: updated.blockedAt,
      blockedReason: updated.blockedReason,
    });
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
    console.error("POST /api/admin/clients/[id]/block error:", error);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
