import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

/** Read the substitutions settings for this tenant. */
export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");
    return NextResponse.json({
      subRequestAdminApprovalHours: tenant.subRequestAdminApprovalHours,
    });
  } catch (error) {
    console.error("GET /api/admin/substitutions/settings error:", error);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 },
    );
  }
}

/** Update the substitutions settings for this tenant. */
export async function PATCH(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = (await request.json()) as {
      subRequestAdminApprovalHours?: number;
    };
    if (
      body.subRequestAdminApprovalHours == null ||
      !Number.isFinite(body.subRequestAdminApprovalHours) ||
      body.subRequestAdminApprovalHours < 0 ||
      body.subRequestAdminApprovalHours > 720
    ) {
      return NextResponse.json(
        { error: "subRequestAdminApprovalHours must be 0..720" },
        { status: 400 },
      );
    }
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        subRequestAdminApprovalHours: Math.round(
          body.subRequestAdminApprovalHours,
        ),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/admin/substitutions/settings error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
