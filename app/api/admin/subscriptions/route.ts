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

    return NextResponse.json(subscriptions);
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
