import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

/**
 * Setup checklist for the admin dashboard. Drives the "empty-state" hero
 * that replaces KPIs when the studio is not yet operational. Detection of
 * the global empty state lives client-side so we can also surface this
 * card as a small subsection once activity starts.
 */
export type ChecklistItemKey =
  | "stripe"
  | "branding"
  | "studio"
  | "disciplines"
  | "coaches"
  | "packages"
  | "classes"
  | "members";

/** Label and description live client-side as i18n keys; the API only
 * tells the client which steps exist, which are completed, and where to
 * link to. */
export interface ChecklistItem {
  key: ChecklistItemKey;
  completed: boolean;
  href: string;
}

export interface OnboardingChecklistResponse {
  isComplete: boolean;
  completedCount: number;
  totalCount: number;
  /** True when the studio has no meaningful operating activity yet (no classes scheduled, no members). */
  isStudioEmpty: boolean;
  items: ChecklistItem[];
}

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;
    const now = new Date();

    const [
      studioCount,
      disciplineCount,
      coachCount,
      packageCount,
      futureClassCount,
      clientMemberCount,
    ] = await Promise.all([
      prisma.studio.count({ where: { tenantId } }),
      prisma.classType.count({ where: { tenantId } }),
      prisma.membership.count({ where: { tenantId, role: "COACH" } }),
      prisma.package.count({ where: { tenantId, isActive: true } }),
      prisma.class.count({
        where: {
          tenantId,
          startsAt: { gte: now },
          status: "SCHEDULED",
        },
      }),
      prisma.membership.count({ where: { tenantId, role: "CLIENT" } }),
    ]);

    const stripeConnected =
      !!ctx.tenant.stripeAccountId && ctx.tenant.stripeAccountStatus === "active";

    const brandingConfigured =
      !!ctx.tenant.logoUrl || ctx.tenant.colorAccent !== "#FF5A2C";

    const items: ChecklistItem[] = [
      { key: "stripe", completed: stripeConnected, href: "/admin/settings/billing" },
      { key: "branding", completed: brandingConfigured, href: "/admin/branding" },
      { key: "studio", completed: studioCount > 0, href: "/admin/studios" },
      { key: "disciplines", completed: disciplineCount > 0, href: "/admin/class-types" },
      { key: "coaches", completed: coachCount > 0, href: "/admin/coaches" },
      { key: "packages", completed: packageCount > 0, href: "/admin/packages" },
      { key: "classes", completed: futureClassCount > 0, href: "/admin/schedule" },
      { key: "members", completed: clientMemberCount > 0, href: "/admin/clients" },
    ];

    const completedCount = items.filter((i) => i.completed).length;
    const totalCount = items.length;

    // "Empty studio" = no future classes AND no client members.
    // These are the two strongest signals that the studio isn't operating yet.
    const isStudioEmpty = futureClassCount === 0 && clientMemberCount === 0;

    const response: OnboardingChecklistResponse = {
      isComplete: completedCount === totalCount,
      completedCount,
      totalCount,
      isStudioEmpty,
      items,
    };
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      {
        isComplete: true,
        completedCount: 0,
        totalCount: 0,
        isStudioEmpty: false,
        items: [],
      } satisfies OnboardingChecklistResponse,
      { status: 200 },
    );
  }
}
