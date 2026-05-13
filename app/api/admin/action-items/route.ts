import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

/**
 * Action items for the admin dashboard hero strip. Each item is something
 * the admin can act on right now — surfaced as a pill linking to the page
 * that resolves it.
 *
 * Returns only items with `count > 0` or a non-OK state, so the dashboard
 * can hide the whole strip when there's nothing pending.
 */
export type ActionItemSeverity = "info" | "warning" | "urgent";

export type ActionItemKey =
  | "no_shows"
  | "connect_pending"
  | "connect_restricted"
  | "connect_missing"
  | "trial_ending"
  | "saas_payment_failed"
  | "platform_alerts"
  | "open_debts"
  | "pending_availability";

export interface ActionItem {
  key: ActionItemKey;
  severity: ActionItemSeverity;
  /** Primary numeric value (count, days, etc.) — interpretation depends on key. */
  count: number;
  href: string;
}

export interface ActionItemsResponse {
  items: ActionItem[];
}

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK");
    const now = new Date();

    const [pendingNoShows, platformAlerts, openDebts, pendingAvailability] = await Promise.all([
      prisma.pendingPenalty.count({
        where: { tenantId: tenant.id, status: "pending" },
      }),
      prisma.platformAlert.count({
        where: { tenantId: tenant.id, isResolved: false },
      }),
      prisma.debt.count({
        where: { tenantId: tenant.id, status: "OPEN" },
      }),
      prisma.coachAvailabilityBlock.count({
        where: { tenantId: tenant.id, status: "pending_approval" },
      }),
    ]);

    const items: ActionItem[] = [];

    if (pendingNoShows > 0) {
      items.push({
        key: "no_shows",
        severity: "warning",
        count: pendingNoShows,
        href: "/admin/no-shows",
      });
    }

    if (!tenant.stripeAccountId) {
      items.push({
        key: "connect_missing",
        severity: "warning",
        count: 1,
        href: "/admin/settings/billing",
      });
    } else if (tenant.stripeAccountStatus === "restricted") {
      items.push({
        key: "connect_restricted",
        severity: "urgent",
        count: 1,
        href: "/admin/settings/billing",
      });
    } else if (tenant.stripeAccountStatus === "pending") {
      items.push({
        key: "connect_pending",
        severity: "warning",
        count: 1,
        href: "/admin/settings/billing",
      });
    }

    if (tenant.subscriptionStatus === "trialing" && tenant.trialEndsAt) {
      const days = Math.ceil(
        (tenant.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (days >= 0 && days <= 7) {
        items.push({
          key: "trial_ending",
          severity: days <= 2 ? "urgent" : "info",
          count: days,
          href: "/admin/settings/billing",
        });
      }
    } else if (
      tenant.subscriptionStatus === "past_due" ||
      tenant.subscriptionStatus === "incomplete" ||
      tenant.subscriptionStatus === "unpaid"
    ) {
      items.push({
        key: "saas_payment_failed",
        severity: "urgent",
        count: 1,
        href: "/admin/settings/billing",
      });
    }

    if (platformAlerts > 0) {
      items.push({
        key: "platform_alerts",
        severity: "warning",
        count: platformAlerts,
        href: "/admin/platforms",
      });
    }

    if (openDebts > 0) {
      items.push({
        key: "open_debts",
        severity: "urgent",
        count: openDebts,
        href: "/admin/clients",
      });
    }

    if (pendingAvailability > 0) {
      items.push({
        key: "pending_availability",
        severity: "info",
        count: pendingAvailability,
        href: "/admin/availability",
      });
    }

    const sorted = items.sort((a, b) => {
      const order: Record<ActionItemSeverity, number> = { urgent: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    const response: ActionItemsResponse = { items: sorted };
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ items: [] } satisfies ActionItemsResponse);
  }
}
