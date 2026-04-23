import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  confirmPendingPenalty,
  revertPendingPenalty,
  waivePendingPenalty,
} from "@/lib/no-show-penalty";

/**
 * POST /api/admin/no-shows/[id]
 * Body: { action: "confirm" | "waive" | "revert", note?: string }
 * Resolve a pending penalty. ADMIN and FRONT_DESK roles may resolve.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("FRONT_DESK");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { action, note } = body as { action?: string; note?: string };

    if (!action || !["confirm", "waive", "revert"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be confirm, waive, or revert" },
        { status: 400 },
      );
    }

    const existing = await prisma.pendingPenalty.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json(
        { error: "Penalty already resolved" },
        { status: 409 },
      );
    }

    let result;
    if (action === "confirm") {
      result = await confirmPendingPenalty({
        pendingId: id,
        resolvedBy: ctx.session.user.id,
        note,
      });
    } else if (action === "waive") {
      result = await waivePendingPenalty({
        pendingId: id,
        resolvedBy: ctx.session.user.id,
        note,
      });
    } else {
      result = await revertPendingPenalty({
        pendingId: id,
        resolvedBy: ctx.session.user.id,
        note,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("POST /api/admin/no-shows/[id] error:", error);
    return NextResponse.json({ error: "Failed to resolve penalty" }, { status: 500 });
  }
}
