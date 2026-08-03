import { describe, expect, it } from "vitest";
import { needsReconcile, RECONCILE_AFTER_MS, type ReconcilableVideo } from "./reconcile";

const NOW = new Date("2026-08-03T14:00:00Z");

const video = (over: Partial<ReconcilableVideo> = {}): ReconcilableVideo => ({
  id: "v1",
  cloudflareStreamUid: "uid",
  status: "processing",
  createdAt: new Date(NOW.getTime() - 10 * 60 * 1000),
  ...over,
});

describe("needsReconcile", () => {
  it("chases a video that has been processing past the grace window", () => {
    expect(needsReconcile(video(), NOW)).toBe(true);
  });

  it("leaves a fresh upload alone so the webhook can do its job", () => {
    const fresh = video({ createdAt: new Date(NOW.getTime() - 30 * 1000) });
    expect(needsReconcile(fresh, NOW)).toBe(false);
  });

  it("does not chase videos that already resolved", () => {
    expect(needsReconcile(video({ status: "ready" }), NOW)).toBe(false);
    expect(needsReconcile(video({ status: "errored" }), NOW)).toBe(false);
  });

  it("waits the full grace window, not a moment less", () => {
    const justInside = video({ createdAt: new Date(NOW.getTime() - RECONCILE_AFTER_MS) });
    const justOutside = video({
      createdAt: new Date(NOW.getTime() - RECONCILE_AFTER_MS - 1000),
    });
    expect(needsReconcile(justInside, NOW)).toBe(false);
    expect(needsReconcile(justOutside, NOW)).toBe(true);
  });
});
