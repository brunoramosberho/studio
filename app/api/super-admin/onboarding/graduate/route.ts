import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/tenant";
import { graduateTenant } from "@/lib/onboarding/graduate-tenant";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireSuperAdmin();

    const { tenantId } = await req.json();
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId es requerido" }, { status: 400 });
    }

    console.log(`[onboarding/graduate] Graduating tenant ${tenantId} to production...`);
    const result = await graduateTenant(tenantId);
    console.log(
      `[onboarding/graduate] Done: ${result.demoUsersDeleted} demo users, ${result.classesDeleted} classes, ${result.feedEventsDeleted} feed events deleted`,
    );

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error interno";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[onboarding/graduate]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
