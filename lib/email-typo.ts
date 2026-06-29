// Lightweight email typo suggester (mailcheck-style). Catches the common
// mistakes we see at sign-up — a mistyped popular domain (gmial.com) or a
// mistyped TLD (.con instead of .com) — and proposes the fix. Conservative on
// purpose: only suggests when we're confident, so valid addresses (.co, .mx…)
// are never flagged. UI shows it as an optional "did you mean?" — never blocks.

const POPULAR_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.es",
  "hotmail.com.mx",
  "outlook.com",
  "outlook.es",
  "live.com",
  "live.com.mx",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "yahoo.es",
  "yahoo.com.mx",
  "proton.me",
  "protonmail.com",
];

// High-confidence TLD typos → correction. Applied to any domain (so it also
// fixes company addresses, not just the popular providers above).
const TLD_TYPOS: Record<string, string> = {
  con: "com",
  cmo: "com",
  ocm: "com",
  vom: "com",
  xom: "com",
  comm: "com",
  cpm: "com",
  clm: "com",
  coom: "com",
  "com.": "com",
  om: "com",
  ney: "net",
  nte: "net",
  ner: "net",
  ogr: "org",
  rog: "org",
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Closest entry in `list` within `maxDist`, or null. */
function closest(value: string, list: string[], maxDist: number): string | null {
  let best: string | null = null;
  let bestDist = maxDist + 1;
  for (const candidate of list) {
    if (candidate === value) return null; // already exact — nothing to suggest
    const d = levenshtein(value, candidate);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return bestDist <= maxDist ? best : null;
}

/**
 * Suggest a correction for a likely-mistyped email, or null when it looks fine
 * (or is too incomplete to judge). The local part keeps its original casing;
 * only the domain is normalised/corrected.
 */
export function suggestEmailCorrection(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  // Need a local part and a domain to evaluate.
  if (at < 1 || at === trimmed.length - 1) return null;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (!domain.includes(".") || domain.endsWith(".")) return null; // still typing

  // 1) Whole-domain typo against the popular list (gmial.com → gmail.com).
  //    Allow distance 2 only for longer domains to avoid over-eager matches.
  const maxDomainDist = domain.length >= 9 ? 2 : 1;
  const domainFix = closest(domain, POPULAR_DOMAINS, maxDomainDist);
  if (domainFix) return `${local}@${domainFix}`;

  // 2) TLD typo on any domain (foo@company.con → foo@company.com).
  const lastDot = domain.lastIndexOf(".");
  const sld = domain.slice(0, lastDot);
  const tld = domain.slice(lastDot + 1);
  if (TLD_TYPOS[tld] && TLD_TYPOS[tld] !== tld) {
    return `${local}@${sld}.${TLD_TYPOS[tld]}`;
  }

  return null;
}
