import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import {
  pauseSubscription,
  resumeSubscription,
  cancelMemberSubscription,
} from "@/lib/stripe/subscriptions";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");

    const subscriptions = await prisma.memberSubscription.findMany({
      where: { tenantId: tenant.id },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        package: { select: { id: true, name: true, price: true, currency: true, recurringInterval: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Usage health per subscriber for the current billing cycle: how many
    // classes they've taken and the effective €/class (price ÷ classes). A high
    // €/class (above a drop-in) flags a member who's overpaying — churn/downgrade
    // risk; a low one flags a power user. We only surface the *negative* badges
    // once ≥50% of the cycle has elapsed, so a freshly-renewed member isn't
    // wrongly flagged as under-using.
    const now = new Date();
    const active = subscriptions.filter((s) => s.status !== "canceled");
    const userIds = [...new Set(active.map((s) => s.userId))];

    // Drop-in reference price — the break-even threshold for the badge. Prefer a
    // package named ~"drop"; fall back to the priciest single-class pack.
    const dropInPkg =
      (await prisma.package.findFirst({
        where: { tenantId: tenant.id, name: { contains: "drop", mode: "insensitive" } },
        orderBy: { price: "desc" },
        select: { price: true },
      })) ??
      (await prisma.package.findFirst({
        where: { tenantId: tenant.id, credits: 1, price: { gt: 0 } },
        orderBy: { price: "desc" },
        select: { price: true },
      }));
    const dropInCents = Math.round((dropInPkg?.price ?? 0) * 100);

    // One query for every active subscriber's realized attendances since the
    // earliest current-cycle start; bucketed per subscription below.
    const earliestStart = active.reduce<Date>(
      (min, s) => (s.currentPeriodStart < min ? s.currentPeriodStart : min),
      now,
    );
    const cycleBookings = userIds.length
      ? await prisma.booking.findMany({
          where: {
            tenantId: tenant.id,
            userId: { in: userIds },
            status: { in: ["ATTENDED", "CONFIRMED"] },
            class: { startsAt: { gte: earliestStart, lte: now } },
          },
          select: { userId: true, class: { select: { startsAt: true } } },
        })
      : [];

    const withUsage = subscriptions.map((s) => {
      if (s.status === "canceled") return { ...s, usage: null };
      const windowEnd = s.currentPeriodEnd < now ? s.currentPeriodEnd : now;
      const classesThisCycle = cycleBookings.filter(
        (b) =>
          b.userId === s.userId &&
          b.class.startsAt >= s.currentPeriodStart &&
          b.class.startsAt <= windowEnd,
      ).length;
      const priceCents = Math.round(s.package.price * 100);

      const startMs = s.currentPeriodStart.getTime();
      const endMs = s.currentPeriodEnd.getTime();
      const progress =
        endMs > startMs
          ? Math.min(1, Math.max(0, (now.getTime() - startMs) / (endMs - startMs)))
          : 1;

      // €/class is misleading mid-cycle — the denominator keeps growing, so
      // everyone looks "expensive per class" until the cycle closes. Project the
      // member's current pace to the full cycle, and only judge once ≥50% has
      // elapsed (enough signal to project). effectivePerClassCents is therefore a
      // pace estimate that converges to the real rate by cycle end.
      let effectivePerClassCents: number | null = null;
      let status: "none" | "no_use" | "low_use" | "power_user" = "none";
      if (progress >= 0.5) {
        const projectedClasses = progress > 0 ? classesThisCycle / progress : classesThisCycle;
        if (projectedClasses > 0) {
          effectivePerClassCents = Math.round(priceCents / projectedClasses);
        }
        if (classesThisCycle === 0) {
          status = "no_use";
        } else if (
          dropInCents > 0 &&
          effectivePerClassCents != null &&
          effectivePerClassCents <= Math.round(dropInCents / 2)
        ) {
          status = "power_user";
        } else if (
          dropInCents > 0 &&
          effectivePerClassCents != null &&
          effectivePerClassCents > dropInCents
        ) {
          status = "low_use";
        }
      }

      return { ...s, usage: { classesThisCycle, effectivePerClassCents, status } };
    });

    return NextResponse.json(withUsage);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (["Unauthorized", "Forbidden"].includes(message)) {
      return NextResponse.json(
        { error: message },
        { status: message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("GET /api/admin/subscriptions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json();
    const { subscriptionId, action, resumesAt } = body as {
      subscriptionId: string;
      action: "pause" | "resume" | "cancel";
      resumesAt?: string;
    };

    if (!subscriptionId || !action) {
      return NextResponse.json(
        { error: "subscriptionId and action are required" },
        { status: 400 },
      );
    }

    const memberSub = await prisma.memberSubscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
    });

    if (!memberSub || memberSub.tenantId !== tenant.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    switch (action) {
      case "pause":
        await pauseSubscription(
          subscriptionId,
          resumesAt ? new Date(resumesAt) : undefined,
        );
        break;
      case "resume":
        await resumeSubscription(subscriptionId);
        break;
      case "cancel":
        await cancelMemberSubscription(subscriptionId, true);
        break;
      default:
        return NextResponse.json(
          { error: "action must be pause, resume, or cancel" },
          { status: 400 },
        );
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (["Unauthorized", "Forbidden"].includes(message)) {
      return NextResponse.json(
        { error: message },
        { status: message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("PATCH /api/admin/subscriptions error:", error);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 },
    );
  }
}
