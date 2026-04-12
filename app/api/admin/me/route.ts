import { NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { getPermissionsForRole } from "@/lib/permissions";

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    return NextResponse.json({
      role: ctx.membership.role,
      permissions: getPermissionsForRole(ctx.membership.role),
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
