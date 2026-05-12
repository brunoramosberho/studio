import { describe, expect, it } from "vitest";
import { computeSignature, verifySignature } from "./webhooks";

describe("computeSignature", () => {
  it("matches an openssl reference value", () => {
    // Reference: echo -n "hello world" | openssl dgst -sha1 -hmac "secret"
    // → 03376ee7ad7bbfceee98660439a4d8b125122a5a (then uppercased).
    const sig = computeSignature("hello world", "secret");
    expect(sig).toBe("03376EE7AD7BBFCEEE98660439A4D8B125122A5A");
  });

  it("returns uppercase hex", () => {
    const sig = computeSignature("anything", "key");
    expect(sig).toMatch(/^[0-9A-F]+$/);
  });

  it("handles unicode bodies as utf-8", () => {
    const sig1 = computeSignature(JSON.stringify({ name: "Ramón Núñez" }), "k");
    const sig2 = computeSignature(JSON.stringify({ name: "Ramon Nunez" }), "k");
    expect(sig1).not.toBe(sig2);
  });
});

describe("verifySignature", () => {
  const body = JSON.stringify({
    event_type: "booking-requested",
    event_data: { slot: { booking_number: "BK_X" } },
  });
  const secret = "test-secret-key";

  it("accepts a correctly signed body", () => {
    const sig = computeSignature(body, secret);
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it("accepts lowercase signature headers", () => {
    const sig = computeSignature(body, secret).toLowerCase();
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it("accepts the 0X prefixed style shown in docs", () => {
    const sig = `0X${computeSignature(body, secret)}`;
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = computeSignature(body, secret);
    expect(verifySignature(body + " ", sig, secret)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const sig = computeSignature(body, "other-secret");
    expect(verifySignature(body, sig, secret)).toBe(false);
  });

  it("rejects missing signature", () => {
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, undefined, secret)).toBe(false);
    expect(verifySignature(body, "", secret)).toBe(false);
  });

  it("rejects missing secret", () => {
    const sig = computeSignature(body, secret);
    expect(verifySignature(body, sig, "")).toBe(false);
  });

  it("rejects a malformed signature without crashing", () => {
    expect(verifySignature(body, "not-hex!", secret)).toBe(false);
    expect(verifySignature(body, "ABCD", secret)).toBe(false);
  });
});
