import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/tenant";
import { getMemberWaiverStatus } from "@/lib/waiver/status";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getMemberWaiverStatus(
    ctx.session.user.id,
    ctx.tenant.id,
  );

  return NextResponse.json(result);
}
