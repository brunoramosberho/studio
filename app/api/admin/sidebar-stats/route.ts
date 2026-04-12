import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK");
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [activeClasses, pendingWaitlist, newClients, recentFeed] =
      await Promise.all([
        prisma.class.count({
          where: { tenantId: tenant.id, status: "SCHEDULED", startsAt: { gte: now } },
        }),
        prisma.waitlist.count({
          where: {
            tenantId: tenant.id,
            class: { status: "SCHEDULED", startsAt: { gte: now } },
          },
        }),
        prisma.membership.count({
          where: { tenantId: tenant.id, role: "CLIENT", createdAt: { gte: sevenDaysAgo } },
        }),
        prisma.feedEvent.count({
          where: { tenantId: tenant.id, eventType: "STUDIO_POST", createdAt: { gte: sevenDaysAgo } },
        }),
      ]);

    return NextResponse.json({ activeClasses, pendingWaitlist, newClients, recentFeed });
  } catch {
    return NextResponse.json({ activeClasses: 0, pendingWaitlist: 0, newClients: 0, recentFeed: 0 });
  }
}
