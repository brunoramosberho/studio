import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tenant";
import {
  heartbeatStreamSession,
  endStreamSession,
} from "@/lib/on-demand";

interface RequestBody {
  sessionId: string;
  ended?: boolean;
  watchedSeconds?: number;
  furthestSeconds?: number;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as RequestBody;
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    if (body.ended) {
      // Persist the final numbers before closing, so a session that ends on
      // unload still reports what was watched.
      await heartbeatStreamSession({
        sessionId: body.sessionId,
        tenantId: ctx.tenant.id,
        userId: ctx.session.user.id,
        watchedSeconds: body.watchedSeconds,
        furthestSeconds: body.furthestSeconds,
      });
      await endStreamSession({
        sessionId: body.sessionId,
        tenantId: ctx.tenant.id,
        userId: ctx.session.user.id,
      });
      return NextResponse.json({ ok: true, ended: true });
    }

    const result = await heartbeatStreamSession({
      sessionId: body.sessionId,
      tenantId: ctx.tenant.id,
      userId: ctx.session.user.id,
      watchedSeconds: body.watchedSeconds,
      furthestSeconds: body.furthestSeconds,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, reason: result.reason },
        { status: result.reason === "superseded" ? 409 : 410 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/on-demand/heartbeat error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
