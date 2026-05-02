import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMany = vi.fn();
const create = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    onDemandStreamSession: {
      updateMany: (...args: unknown[]) => updateMany(...args),
      create: (...args: unknown[]) => create(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => transaction(cb),
  },
}));

import {
  startStreamSession,
  heartbeatStreamSession,
  cleanupStaleSessions,
  HEARTBEAT_TIMEOUT_MS,
} from "./concurrency";

beforeEach(() => {
  updateMany.mockReset();
  create.mockReset();
  findUnique.mockReset();
  update.mockReset();
  transaction.mockReset();
});

describe("startStreamSession", () => {
  it("supersedes any active session for the same user before creating a new one", async () => {
    const txClient = {
      onDemandStreamSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: "new-session" }),
      },
    };
    transaction.mockImplementation((cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient));

    const session = await startStreamSession({
      tenantId: "t",
      userId: "u",
      videoId: "v",
      clientIp: "1.2.3.4",
      userAgent: "ua",
    });

    expect(txClient.onDemandStreamSession.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t", userId: "u", endedAt: null },
      data: { endedAt: expect.any(Date), endedReason: "superseded" },
    });
    expect(txClient.onDemandStreamSession.create).toHaveBeenCalledWith({
      data: {
        tenantId: "t",
        userId: "u",
        videoId: "v",
        clientIp: "1.2.3.4",
        userAgent: "ua",
      },
    });
    expect(session).toEqual({ id: "new-session" });
  });
});

describe("heartbeatStreamSession", () => {
  it("returns ok=true and refreshes lastHeartbeatAt for an active session", async () => {
    findUnique.mockResolvedValue({
      id: "s",
      tenantId: "t",
      userId: "u",
      endedAt: null,
      endedReason: null,
    });
    update.mockResolvedValue({ id: "s" });

    const result = await heartbeatStreamSession({
      sessionId: "s",
      tenantId: "t",
      userId: "u",
    });

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: "s" },
      data: { lastHeartbeatAt: expect.any(Date) },
    });
  });

  it("returns reason=superseded for a session that was displaced by another playback", async () => {
    findUnique.mockResolvedValue({
      id: "s",
      tenantId: "t",
      userId: "u",
      endedAt: new Date(),
      endedReason: "superseded",
    });

    const result = await heartbeatStreamSession({
      sessionId: "s",
      tenantId: "t",
      userId: "u",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("superseded");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects heartbeat from a different tenant or user (cross-tenant safety)", async () => {
    findUnique.mockResolvedValue({
      id: "s",
      tenantId: "other-tenant",
      userId: "u",
      endedAt: null,
      endedReason: null,
    });

    const result = await heartbeatStreamSession({
      sessionId: "s",
      tenantId: "t",
      userId: "u",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("tenant_mismatch");
  });

  it("returns reason=not_found when the session does not exist", async () => {
    findUnique.mockResolvedValue(null);
    const result = await heartbeatStreamSession({
      sessionId: "missing",
      tenantId: "t",
      userId: "u",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });
});

describe("cleanupStaleSessions", () => {
  it("ends sessions whose lastHeartbeatAt is older than the timeout", async () => {
    updateMany.mockResolvedValue({ count: 3 });
    const now = new Date("2026-05-01T12:00:00Z");

    const cleaned = await cleanupStaleSessions(now);

    expect(cleaned).toBe(3);
    const cutoff = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        endedAt: null,
        lastHeartbeatAt: { lt: cutoff },
      },
      data: {
        endedAt: now,
        endedReason: "heartbeat_timeout",
      },
    });
  });
});
