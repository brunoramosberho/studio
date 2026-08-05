import { prisma } from "@/lib/db";
import type { OnDemandStreamSession } from "@prisma/client";

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_TIMEOUT_MS = 90_000;

/**
 * Start a new playback session for (user, tenant, video). Any other active
 * session for the same (user, tenant) is superseded — its endedReason is set
 * so the displaced client can detect it via the heartbeat endpoint and show
 * a "viewing stopped" message.
 *
 * This enforces the "1 stream per user" cap.
 */
export async function startStreamSession(params: {
  tenantId: string;
  userId: string;
  videoId: string;
  clientIp?: string | null;
  userAgent?: string | null;
}): Promise<OnDemandStreamSession> {
  return prisma.$transaction(async (tx) => {
    await tx.onDemandStreamSession.updateMany({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
        endedAt: null,
      },
      data: {
        endedAt: new Date(),
        endedReason: "superseded",
      },
    });

    return tx.onDemandStreamSession.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        videoId: params.videoId,
        clientIp: params.clientIp ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  });
}

export type HeartbeatResult =
  | { ok: true; session: OnDemandStreamSession }
  | { ok: false; reason: "superseded" | "ended" | "not_found" | "tenant_mismatch" };

/**
 * Heartbeat: refresh lastHeartbeatAt on an active session. If it was
 * superseded by a newer playback, the client learns about it here and can
 * surface the "viewing stopped" message.
 */
export async function heartbeatStreamSession(params: {
  sessionId: string;
  tenantId: string;
  userId: string;
  /** Seconds actually played, as counted by the player. */
  watchedSeconds?: number;
  /** Furthest position reached in the video. */
  furthestSeconds?: number;
}): Promise<HeartbeatResult> {
  const session = await prisma.onDemandStreamSession.findUnique({
    where: { id: params.sessionId },
  });
  if (!session) return { ok: false, reason: "not_found" };
  if (session.tenantId !== params.tenantId || session.userId !== params.userId) {
    return { ok: false, reason: "tenant_mismatch" };
  }
  if (session.endedAt && session.endedReason === "superseded") {
    return { ok: false, reason: "superseded" };
  }
  if (session.endedAt) {
    return { ok: false, reason: "ended" };
  }
  const updated = await prisma.onDemandStreamSession.update({
    where: { id: session.id },
    data: {
      lastHeartbeatAt: new Date(),
      // Monotonic: a retried or out-of-order heartbeat must never walk the
      // numbers backwards.
      watchedSeconds: Math.max(
        clampSeconds(session.watchedSeconds),
        clampSeconds(params.watchedSeconds),
      ),
      furthestSeconds: Math.max(
        clampSeconds(session.furthestSeconds),
        clampSeconds(params.furthestSeconds),
      ),
    },
  });
  return { ok: true, session: updated };
}

export async function endStreamSession(params: {
  sessionId: string;
  tenantId: string;
  userId: string;
}): Promise<void> {
  await prisma.onDemandStreamSession.updateMany({
    where: {
      id: params.sessionId,
      tenantId: params.tenantId,
      userId: params.userId,
      endedAt: null,
    },
    data: {
      endedAt: new Date(),
      endedReason: "user_ended",
    },
  });
}

/**
 * Cron entry point: mark any active session whose lastHeartbeatAt is older
 * than HEARTBEAT_TIMEOUT_MS as ended. Returns count of cleaned sessions.
 */
export async function cleanupStaleSessions(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);
  const result = await prisma.onDemandStreamSession.updateMany({
    where: {
      endedAt: null,
      lastHeartbeatAt: { lt: cutoff },
    },
    data: {
      endedAt: now,
      endedReason: "heartbeat_timeout",
    },
  });
  return result.count;
}

/**
 * Player-reported seconds are untrusted input: clamp to a sane range so a
 * broken client can't write a negative or absurd number into the metrics.
 */
function clampSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  // 12 hours — far beyond any class video, tight enough to catch nonsense.
  return Math.min(Math.round(value), 43_200);
}
