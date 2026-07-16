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
import {
  validatePayoutAccount,
  normalizeAccount,
  maskAccount,
  type PayoutMethod,
} from "@/lib/banking/validate";

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
      // Masked — the tenant UI shows "ES91 •••• 1332" and only asks for the
      // account when none is stored. Full value never leaves the server here.
      payout: config?.payoutAccount
        ? {
            method: config.payoutMethod,
            accountMasked: maskAccount(config.payoutAccount),
            holder: config.payoutHolder,
          }
        : null,
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

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");

    if (!(await isWellhubApiActive(ctx.tenant.id))) {
      return NextResponse.json({ error: "Wellhub no está activo" }, { status: 422 });
    }

    // Resolve the destination account: stored on the config, or provided in
    // this request (validated + persisted for next time). Without one, the
    // draw is refused — the transfer instruction must travel with the request.
    const body = (await request.json().catch(() => ({}))) as {
      payoutMethod?: string;
      payoutAccount?: string;
      payoutHolder?: string;
    };
    const config = await prisma.wellhubAdvanceConfig.findUnique({
      where: { tenantId: ctx.tenant.id },
      select: { payoutMethod: true, payoutAccount: true, payoutHolder: true },
    });

    let payout: { method: string; account: string; holder: string } | null = null;
    if (body.payoutAccount && body.payoutMethod) {
      const method = body.payoutMethod as PayoutMethod;
      if (!["iban", "clabe"].includes(method)) {
        return NextResponse.json({ error: "Método de cuenta inválido" }, { status: 400 });
      }
      const holder = (body.payoutHolder ?? "").trim();
      if (holder.length < 3) {
        return NextResponse.json(
          { error: "Falta el nombre del titular de la cuenta", code: "payout_holder_required" },
          { status: 422 },
        );
      }
      const check = validatePayoutAccount(method, body.payoutAccount);
      if (!check.valid) {
        return NextResponse.json({ error: check.error, code: "payout_invalid" }, { status: 422 });
      }
      const account = normalizeAccount(body.payoutAccount);
      await prisma.wellhubAdvanceConfig.upsert({
        where: { tenantId: ctx.tenant.id },
        create: {
          tenantId: ctx.tenant.id,
          payoutMethod: method,
          payoutAccount: account,
          payoutHolder: holder,
          payoutUpdatedAt: new Date(),
        },
        update: {
          payoutMethod: method,
          payoutAccount: account,
          payoutHolder: holder,
          payoutUpdatedAt: new Date(),
        },
      });
      payout = { method, account, holder };
    } else if (config?.payoutAccount && config.payoutMethod) {
      payout = {
        method: config.payoutMethod,
        account: config.payoutAccount,
        holder: config.payoutHolder ?? "",
      };
    }

    if (!payout) {
      return NextResponse.json(
        {
          error: "Configura la cuenta bancaria (IBAN o CLABE) para recibir el adelanto",
          code: "payout_required",
        },
        { status: 422 },
      );
    }

    const tz = await resolveScheduleTimezone(ctx.tenant);
    const currency = (await getTenantCurrency()).code;
    const advance = await createAdvanceDraw({
      tenantId: ctx.tenant.id,
      timeZone: tz,
      currency,
      payout,
      requestedBy: ctx.session.user.id,
    });

    // Alert the super-admins that money is waiting on their approval — with
    // the full transfer instruction (account + holder + amount breakdown).
    // Awaited (serverless can freeze after the response) but never throws.
    const { notifySuperAdminsOfAdvance } = await import("@/lib/platforms/wellhub/advance-notify");
    const fmt = (cents: number) =>
      new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
    await notifySuperAdminsOfAdvance({
      kind: "draw",
      tenantName: ctx.tenant.name,
      tenantSlug: ctx.tenant.slug,
      amountLabel: fmt(advance.netCents),
      details: [
        `Bruto: ${fmt(advance.grossCents)} (${advance.checkins} check-ins, ${advance.noShows} no-shows, ${advance.lateCancels} late-cancels)`,
        `Comisión ${advance.feePercent}%: −${fmt(advance.feeCents)} · IVA ${advance.vatPercent}%: −${fmt(advance.vatCents)}`,
        `Neto a transferir: ${fmt(advance.netCents)}`,
        `${payout.method.toUpperCase()}: ${payout.account}`,
        `Titular: ${payout.holder}`,
        `Periodo: ${advance.period}`,
      ],
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
