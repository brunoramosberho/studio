import { describe, expect, it } from "vitest";
import { isPooledUrl, withConnectionLimit } from "./db-url";

const POOLED = "postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true";
const DIRECT = "postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:5432/postgres";

describe("isPooledUrl", () => {
  it("recognises the pooler by port and by flag", () => {
    expect(isPooledUrl(POOLED)).toBe(true);
    expect(isPooledUrl("postgresql://u:p@host:5432/db?pgbouncer=true")).toBe(true);
  });

  it("leaves a direct connection alone", () => {
    expect(isPooledUrl(DIRECT)).toBe(false);
  });

  it("doesn't throw on nonsense", () => {
    expect(isPooledUrl("not a url")).toBe(false);
    expect(isPooledUrl("")).toBe(false);
  });
});

describe("withConnectionLimit", () => {
  it("caps a pooled connection at one per instance", () => {
    const out = new URL(withConnectionLimit(POOLED)!);
    expect(out.searchParams.get("connection_limit")).toBe("1");
    // The existing parameters have to survive, or the pooler stops being used
    // in transaction mode at all.
    expect(out.searchParams.get("pgbouncer")).toBe("true");
    expect(out.port).toBe("6543");
  });

  it("does not cap a direct connection", () => {
    // Migrations and scripts run one at a time and want a real connection;
    // throttling them to one would make long jobs serialise on themselves.
    expect(withConnectionLimit(DIRECT)).toBe(DIRECT);
  });

  it("respects a limit someone set on purpose", () => {
    const explicit = `${POOLED}&connection_limit=5`;
    expect(withConnectionLimit(explicit)).toBe(explicit);
  });

  it("passes through what it cannot parse instead of failing startup", () => {
    expect(withConnectionLimit("not a url")).toBe("not a url");
    expect(withConnectionLimit(undefined)).toBeUndefined();
    expect(withConnectionLimit("")).toBe("");
  });

  it("is idempotent, so a second pass can't stack parameters", () => {
    const once = withConnectionLimit(POOLED)!;
    expect(withConnectionLimit(once)).toBe(once);
  });

  it("keeps the credentials it was given", () => {
    // A silent drop here would look like an auth failure at runtime.
    const out = new URL(withConnectionLimit(POOLED)!);
    expect(out.username).toBe("u");
    expect(out.password).toBe("p");
  });
});
