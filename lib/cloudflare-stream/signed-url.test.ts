import { describe, it, expect, beforeEach } from "vitest";
import { buildSignedTokenPayload } from "./signed-url";

beforeEach(() => {
  process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID = "test-kid-123";
});

describe("buildSignedTokenPayload", () => {
  const fixedNow = new Date("2026-05-01T12:00:00Z");

  it("uses default 1h TTL and includes sub/kid/exp/nbf", () => {
    const { payload, expiresAt } = buildSignedTokenPayload(
      { videoUid: "video-abc" },
      fixedNow,
    );
    const issued = Math.floor(fixedNow.getTime() / 1000);

    expect(payload.sub).toBe("video-abc");
    expect(payload.kid).toBe("test-kid-123");
    expect(payload.exp).toBe(issued + 3600);
    expect(payload.nbf).toBe(issued - 30);
    expect(expiresAt.getTime()).toBe((issued + 3600) * 1000);
  });

  it("respects a custom TTL", () => {
    const { payload } = buildSignedTokenPayload(
      { videoUid: "v", ttlSeconds: 600 },
      fixedNow,
    );
    const issued = Math.floor(fixedNow.getTime() / 1000);
    expect(payload.exp).toBe(issued + 600);
  });

  it("adds IP binding accessRules when clientIp is provided", () => {
    const { payload } = buildSignedTokenPayload(
      { videoUid: "v", clientIp: "203.0.113.42" },
      fixedNow,
    );
    expect(payload.accessRules).toEqual([
      { type: "ip.src", action: "allow", ip: ["203.0.113.42"] },
      { type: "any", action: "block" },
    ]);
  });

  it("omits accessRules when no clientIp is provided", () => {
    const { payload } = buildSignedTokenPayload({ videoUid: "v" }, fixedNow);
    expect(payload.accessRules).toBeUndefined();
  });
});
