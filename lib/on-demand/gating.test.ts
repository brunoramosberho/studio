import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    memberSubscription: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

import { checkOnDemandAccess, videoAccess } from "./gating";

const NOW = new Date("2026-05-01T12:00:00Z");
const FUTURE = new Date("2026-06-01T12:00:00Z");

beforeEach(() => {
  findManyMock.mockReset();
});

describe("checkOnDemandAccess", () => {
  it("returns active_subscription when user has an ON_DEMAND_SUBSCRIPTION", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "sub-1",
        currentPeriodEnd: FUTURE,
        package: { type: "ON_DEMAND_SUBSCRIPTION", includesOnDemand: false },
      },
    ]);

    const result = await checkOnDemandAccess({
      userId: "u",
      tenantId: "t",
      now: NOW,
    });

    expect(result.hasAccess).toBe(true);
    expect(result.reason).toBe("active_subscription");
    expect(result.subscriptionId).toBe("sub-1");
  });

  it("returns bundled_with_package when user has SUBSCRIPTION with includesOnDemand=true", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "sub-2",
        currentPeriodEnd: FUTURE,
        package: { type: "SUBSCRIPTION", includesOnDemand: true },
      },
    ]);

    const result = await checkOnDemandAccess({
      userId: "u",
      tenantId: "t",
      now: NOW,
    });

    expect(result.hasAccess).toBe(true);
    expect(result.reason).toBe("bundled_with_package");
  });

  it("prefers ON_DEMAND_SUBSCRIPTION over a bundled SUBSCRIPTION when both exist", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "od-sub",
        currentPeriodEnd: FUTURE,
        package: { type: "ON_DEMAND_SUBSCRIPTION", includesOnDemand: false },
      },
      {
        id: "bundled-sub",
        currentPeriodEnd: FUTURE,
        package: { type: "SUBSCRIPTION", includesOnDemand: true },
      },
    ]);

    const result = await checkOnDemandAccess({
      userId: "u",
      tenantId: "t",
      now: NOW,
    });

    expect(result.subscriptionId).toBe("od-sub");
    expect(result.reason).toBe("active_subscription");
  });

  it("returns no_access for SUBSCRIPTION without includesOnDemand", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "sub-x",
        currentPeriodEnd: FUTURE,
        package: { type: "SUBSCRIPTION", includesOnDemand: false },
      },
    ]);

    const result = await checkOnDemandAccess({
      userId: "u",
      tenantId: "t",
      now: NOW,
    });

    expect(result.hasAccess).toBe(false);
    expect(result.reason).toBe("no_access");
  });

  it("returns no_access when user has no subscriptions", async () => {
    findManyMock.mockResolvedValue([]);

    const result = await checkOnDemandAccess({
      userId: "u",
      tenantId: "t",
      now: NOW,
    });

    expect(result.hasAccess).toBe(false);
  });

  it("videoAccess: returns subscription access untouched when the user already has access", () => {
    const tenant = {
      hasAccess: true as const,
      reason: "active_subscription" as const,
      subscriptionId: "sub-1",
      expiresAt: FUTURE,
    };
    expect(videoAccess(tenant, true)).toBe(tenant);
    expect(videoAccess(tenant, false)).toBe(tenant);
  });

  it("videoAccess: grants free_video access when the video is free and user has no sub", () => {
    const tenant = { hasAccess: false as const, reason: "no_access" as const };
    expect(videoAccess(tenant, true)).toEqual({
      hasAccess: true,
      reason: "free_video",
    });
  });

  it("videoAccess: leaves no_access when video is not free and user has no sub", () => {
    const tenant = { hasAccess: false as const, reason: "no_access" as const };
    expect(videoAccess(tenant, false)).toBe(tenant);
  });

  it("queries with the right active+future-period filter", async () => {
    findManyMock.mockResolvedValue([]);

    await checkOnDemandAccess({ userId: "u", tenantId: "t", now: NOW });

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const args = findManyMock.mock.calls[0]?.[0] as {
      where: {
        tenantId: string;
        userId: string;
        status: { in: string[] };
        currentPeriodEnd: { gt: Date };
      };
    };
    expect(args.where.tenantId).toBe("t");
    expect(args.where.userId).toBe("u");
    expect(args.where.status.in).toEqual(["active", "trialing"]);
    expect(args.where.currentPeriodEnd.gt.getTime()).toBe(NOW.getTime());
  });
});
