// Super-admin: Wellhub payment-advance operations.
// GET   → access requests + advances across tenants (with per-period context).
// PATCH → { kind: "config", tenantId, access?, feePercent?, vatPercent? }
//         { kind: "advance", advanceId, action: approve|paid|settled|reject }
//
// v1 money movement is manual: approving/paying/settling here is bookkeeping —
// the actual bank transfer happens outside and is recorded by these statuses.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";
import { releaseAdvanceEvents } from "@/lib/platforms/wellhub/advance";

export async function GET() {
  try {
    await requireSuperAdmin();

    const [configs, advances] = await Promise.all([
      prisma.wellhubAdvanceConfig.findMany({
        include: { tenant: { select: { id: true, name: true, slug: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.wellhubAdvance.findMany({
        include: { tenant: { select: { id: true, name: true, slug: true } } },
        orderBy: { requestedAt: "desc" },
        take: 100,
      }),
    ]);

    return NextResponse.json({
      configs: configs.map((c) => ({
        tenantId: c.tenantId,
        tenantName: c.tenant.name,
        tenantSlug: c.tenant.slug,
        access: c.access,
        feePercent: c.feePercent,
        vatPercent: c.vatPercent,
        requestedAt: c.requestedAt,
        enabledAt: c.enabledAt,
      })),
      advances: advances.map((a) => ({
        id: a.id,
        tenantId: a.tenantId,
        tenantName: a.tenant.name,
        tenantSlug: a.tenant.slug,
        period: a.period,
        status: a.status,
        checkins: a.checkins,
        noShows: a.noShows,
        lateCancels: a.lateCancels,
        grossCents: a.grossCents,
        feeCents: a.feeCents,
        vatCents: a.vatCents,
        netCents: a.netCents,
        currency: a.currency,
        payoutMethod: a.payoutMethod,
        payoutAccount: a.payoutAccount,
        payoutHolder: a.payoutHolder,
        requestedAt: a.requestedAt,
        approvedAt: a.approvedAt,
        paidAt: a.paidAt,
        settledAt: a.settledAt,
        notes: a.notes,
      })),
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/super-admin/wellhub-advances error:", error);
    return NextResponse.json({ error: "Failed to load advances" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = await request.json();

    if (body.kind === "config") {
      const { tenantId, access, feePercent, vatPercent } = body as {
        tenantId: string;
        access?: "disabled" | "requested" | "enabled";
        feePercent?: number;
        vatPercent?: number;
      };
      if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

      const data: Record<string, unknown> = {};
      if (access !== undefined) {
        data.access = access;
        if (access === "enabled") data.enabledAt = new Date();
      }
      if (feePercent !== undefined) data.feePercent = Math.max(0, feePercent);
      if (vatPercent !== undefined) data.vatPercent = Math.max(0, vatPercent);

      const config = await prisma.wellhubAdvanceConfig.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      });
      return NextResponse.json({ ok: true, config });
    }

    if (body.kind === "advance") {
      const { advanceId, action, notes } = body as {
        advanceId: string;
        action: "approve" | "paid" | "settled" | "reject";
        notes?: string;
      };
      if (!advanceId || !action) {
        return NextResponse.json({ error: "advanceId and action required" }, { status: 400 });
      }
      const advance = await prisma.wellhubAdvance.findUnique({ where: { id: advanceId } });
      if (!advance) return NextResponse.json({ error: "Advance not found" }, { status: 404 });

      // Legal transitions only — statuses are bookkeeping for real money.
      const transitions: Record<string, { from: string[]; data: Record<string, unknown> }> = {
        approve: { from: ["requested"], data: { status: "approved", approvedAt: new Date() } },
        paid: { from: ["requested", "approved"], data: { status: "paid", paidAt: new Date(), approvedAt: advance.approvedAt ?? new Date() } },
        settled: { from: ["paid"], data: { status: "settled", settledAt: new Date() } },
        reject: { from: ["requested", "approved"], data: { status: "rejected" } },
      };
      const t = transitions[action];
      if (!t) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      if (!t.from.includes(advance.status)) {
        return NextResponse.json(
          { error: `Cannot ${action} an advance in status ${advance.status}` },
          { status: 422 },
        );
      }

      const updated = await prisma.wellhubAdvance.update({
        where: { id: advanceId },
        data: { ...t.data, ...(notes !== undefined ? { notes } : {}) },
      });

      // A rejected draw releases its events so a future draw can cover them.
      if (action === "reject") await releaseAdvanceEvents(advanceId);

      return NextResponse.json({ ok: true, advance: updated });
    }

    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("PATCH /api/super-admin/wellhub-advances error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
