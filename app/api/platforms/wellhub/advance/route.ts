// Wellhub payment advance — tenant-facing API.
// GET  → access state + window + what's available to draw + draw history.
// POST → create a draw request (goes to super-admin for approval; money moves
//        manually in v1).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, getTenantCurrency } from "@/lib/tenant";
import { resolveScheduleTimezone } from "@/lib/schedule/visibility";
import {
  getAdvanceWindow,
  getAdvanceAvailability,
  createAdvanceDraw,
  AdvanceError,
} from "@/lib/platforms/wellhub/advance";

async function isWellhubApiActive(tenantId: string): Promise<boolean> {
  const cfg = await prisma.studioPlatformConfig.findFirst({
    where: { tenantId, platform: "wellhub", isActive: true, wellhubMode: "api" },
    select: { id: true },
  });
  return !!cfg;
}

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;

    const wellhubActive = await isWellhubApiActive(tenantId);
    if (!wellhubActive) {
      // Feature is Wellhub-only; the UI hides the card entirely in this case.
      return NextResponse.json({ eligible: false });
    }

    const tz = await resolveScheduleTimezone(ctx.tenant);
    const w = getAdvanceWindow(new Date(), tz);

    const [config, availability, history] = await Promise.all([
      prisma.wellhubAdvanceConfig.findUnique({ where: { tenantId } }),
      getAdvanceAvailability(tenantId, w),
      prisma.wellhubAdvance.findMany({
        where: { tenantId },
        orderBy: { requestedAt: "desc" },
        take: 24,
      }),
    ]);

    return NextResponse.json({
      eligible: true,
      access: config?.access ?? "disabled",
      requestedAt: config?.requestedAt ?? null,
      window: { open: w.open, period: w.period, localDay: w.localDay },
      available: availability
        ? {
            counts: availability.counts,
            grossCents: availability.grossCents,
            feeCents: availability.feeCents,
            vatCents: availability.vatCents,
            netCents: availability.netCents,
            feePercent: availability.feePercent,
            vatPercent: availability.vatPercent,
            periodGrossCents: availability.periodGrossCents,
            drawnGrossCents: availability.drawnGrossCents,
          }
        : null,
      history: history.map((a) => ({
        id: a.id,
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
        requestedAt: a.requestedAt,
        approvedAt: a.approvedAt,
        paidAt: a.paidAt,
        settledAt: a.settledAt,
      })),
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("GET /api/platforms/wellhub/advance error:", error);
    return NextResponse.json({ error: "Failed to load advance data" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const ctx = await requireRole("ADMIN");

    if (!(await isWellhubApiActive(ctx.tenant.id))) {
      return NextResponse.json({ error: "Wellhub no está activo" }, { status: 422 });
    }

    const tz = await resolveScheduleTimezone(ctx.tenant);
    const currency = (await getTenantCurrency()).code;
    const advance = await createAdvanceDraw({
      tenantId: ctx.tenant.id,
      timeZone: tz,
      currency,
      requestedBy: ctx.session.user.id,
    });

    // Alert the super-admins that money is waiting on their approval.
    // Awaited (serverless can freeze after the response) but never throws.
    const { notifySuperAdminsOfAdvance } = await import("@/lib/platforms/wellhub/advance-notify");
    await notifySuperAdminsOfAdvance({
      kind: "draw",
      tenantName: ctx.tenant.name,
      tenantSlug: ctx.tenant.slug,
      amountLabel: new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(
        advance.netCents / 100,
      ),
    });

    return NextResponse.json({ ok: true, advance }, { status: 201 });
  } catch (error) {
    if (error instanceof AdvanceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/platforms/wellhub/advance error:", error);
    return NextResponse.json({ error: "Failed to request advance" }, { status: 500 });
  }
}
