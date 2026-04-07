import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import type { NudgeType } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;
    const tenantId = tenant.id;

    const body = await request.json();
    const {
      nudgeType,
      event,
      membershipId,
      revenue,
    }: {
      nudgeType: NudgeType;
      event: "shown" | "interacted" | "converted" | "dismissed";
      membershipId?: string;
      revenue?: number;
    } = body;

    if (!nudgeType || !event) {
      return NextResponse.json(
        { error: "nudgeType and event are required" },
        { status: 400 },
      );
    }

    if (event === "shown") {
      await prisma.nudgeEvent.create({
        data: {
          tenantId,
          userId,
          type: nudgeType,
          shown: true,
          metadata: body.metadata ?? undefined,
        },
      });
    } else {
      const existing = await prisma.nudgeEvent.findFirst({
        where: { tenantId, userId, type: nudgeType },
        orderBy: { shownAt: "desc" },
      });

      if (existing) {
        await prisma.nudgeEvent.update({
          where: { id: existing.id },
          data: {
            ...(event === "interacted" && {
              interacted: true,
              interactedAt: new Date(),
            }),
            ...(event === "converted" && {
              interacted: true,
              interactedAt: existing.interactedAt ?? new Date(),
              converted: true,
              convertedAt: new Date(),
              membershipId,
              revenue,
            }),
            ...(event === "dismissed" && {
              interacted: false,
            }),
          },
        });
      } else {
        await prisma.nudgeEvent.create({
          data: {
            tenantId,
            userId,
            type: nudgeType,
            shown: true,
            interacted: event === "interacted" || event === "converted",
            converted: event === "converted",
            interactedAt:
              event === "interacted" || event === "converted"
                ? new Date()
                : undefined,
            convertedAt: event === "converted" ? new Date() : undefined,
            membershipId: event === "converted" ? membershipId : undefined,
            revenue: event === "converted" ? revenue : undefined,
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("POST /api/conversion/nudge/event error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
