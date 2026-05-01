import { NextRequest, NextResponse } from "next/server";
import { cleanupStaleSessions } from "@/lib/on-demand";

/**
 * Sweep stale on-demand stream sessions (no heartbeat for >90s).
 * Marks them ended with reason=heartbeat_timeout. Idempotent.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cleaned = await cleanupStaleSessions();
  return NextResponse.json({ ok: true, cleaned });
}
