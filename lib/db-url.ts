/**
 * Caps how many database connections each serverless instance may hold.
 *
 * Supavisor allows 200 client connections in total. Prisma's default pool is
 * `cpus * 2 + 1` — about five per instance — so roughly forty warm instances
 * exhaust the whole project, and everything touching the database starts
 * failing with EMAXCONN: every studio, the member app, the admin, the crons.
 * That is exactly what happened on 7 August.
 *
 * Behind a transaction-mode pooler more than one connection per instance buys
 * nothing anyway: the pooler is already multiplexing. One per instance raises
 * the ceiling from ~40 instances to ~200.
 *
 * Only the pooled URL is capped. DIRECT_URL is used by migrations and one-off
 * scripts, which want a real connection and are not run hundreds at a time.
 */

/** Supavisor's transaction-mode port. */
const POOLER_PORT = "6543";

export function isPooledUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.port === POOLER_PORT || u.searchParams.get("pgbouncer") === "true";
  } catch {
    return false;
  }
}

/**
 * Returns the URL with `connection_limit=1` when it points at the pooler.
 *
 * An explicit connection_limit already in the URL wins — someone who set it
 * deliberately, in an environment variable, meant it.
 */
export function withConnectionLimit(url: string | undefined): string | undefined {
  if (!url) return url;
  if (!isPooledUrl(url)) return url;

  try {
    const u = new URL(url);
    if (u.searchParams.has("connection_limit")) return url;
    u.searchParams.set("connection_limit", "1");
    return u.toString();
  } catch {
    // An unparseable URL is not worth failing startup over — let Prisma report
    // the real problem rather than masking it with a URL error here.
    return url;
  }
}
