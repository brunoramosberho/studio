// Shared types for `Class.songRequestRules`. The column is `Json` in Prisma;
// every consumer (admin form, eligibility checker, API validators) goes
// through `normalizeRules()` so we never trust raw DB JSON.

export type SongRequestRule =
  | { type: "ALL" }
  | { type: "BIRTHDAY_WEEK" }
  | { type: "ANNIVERSARY" }
  | { type: "FIRST_CLASS" }
  | { type: "CLASS_MILESTONE" }
  | { type: "LEVEL_AT_LEAST"; levelId: string }
  | { type: "SUBSCRIPTION"; packageIds: string[] };

export type SongRequestRuleType = SongRequestRule["type"];

export const SONG_RULE_TYPES: SongRequestRuleType[] = [
  "ALL",
  "BIRTHDAY_WEEK",
  "ANNIVERSARY",
  "FIRST_CLASS",
  "CLASS_MILESTONE",
  "LEVEL_AT_LEAST",
  "SUBSCRIPTION",
];

export const DEFAULT_RULES: SongRequestRule[] = [{ type: "ALL" }];

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = asString(item);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Validates and narrows an unknown payload (from the DB or a request body)
 * to a `SongRequestRule[]`. Unknown rule types and malformed payloads are
 * dropped. Returns the `ALL` default when nothing valid remains so we
 * never end up with an empty rule set on an enabled feature.
 */
export function normalizeRules(input: unknown): SongRequestRule[] {
  if (!Array.isArray(input)) return DEFAULT_RULES;

  const out: SongRequestRule[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const type = asString(obj.type) as SongRequestRuleType | null;
    if (!type) continue;

    switch (type) {
      case "ALL":
      case "BIRTHDAY_WEEK":
      case "ANNIVERSARY":
      case "FIRST_CLASS":
      case "CLASS_MILESTONE":
        out.push({ type });
        break;
      case "LEVEL_AT_LEAST": {
        const levelId = asString(obj.levelId);
        if (levelId) out.push({ type, levelId });
        break;
      }
      case "SUBSCRIPTION": {
        const packageIds = asStringArray(obj.packageIds);
        if (packageIds.length > 0) out.push({ type, packageIds });
        break;
      }
      default:
        break;
    }
  }

  if (out.length === 0) return DEFAULT_RULES;

  // Collapse: if ALL is present, that's the only rule that matters.
  if (out.some((r) => r.type === "ALL")) return [{ type: "ALL" }];

  return out;
}

export function rulesAreOpen(rules: SongRequestRule[]): boolean {
  return rules.length === 0 || rules.some((r) => r.type === "ALL");
}
