/**
 * Behavioural-economics helpers for the curated-packages "decoy effect" (Dan
 * Ariely / asymmetric dominance). Used by the admin config to validate a chosen
 * set in real time (heuristic, instant) and as a fallback for the AI suggestion.
 *
 * The classic 3-option decoy: a low **anchor** (cheap entry), the **target** (the
 * preferred pick you want to push), and a **decoy** (priced ≥ the target but worse
 * value, so the target looks like the obvious choice).
 */

export interface DecoyPackage {
  id: string;
  name: string;
  price: number;
  /** null = unlimited */
  credits: number | null;
  type: string;
}

export interface DecoyCheck {
  level: "ok" | "warn";
  message: string;
}

export interface DecoyAnalysis {
  checks: DecoyCheck[];
  /** "good" when there's a marked target + a real decoy and the target isn't the cheapest. */
  verdict: "good" | "weak" | "incomplete";
}

const isUnlimited = (p: DecoyPackage) => p.credits === null || p.credits === 0;

/** €/class — lower is better value. null for unlimited (treated as best value). */
function perClass(p: DecoyPackage): number | null {
  return isUnlimited(p) ? null : p.price / (p.credits as number);
}

/** Does `target` dominate `other` — i.e. is `other` a decoy that makes `target` obvious? */
function isDecoyFor(target: DecoyPackage, other: DecoyPackage): boolean {
  if (other.id === target.id) return false;
  if (other.price < target.price) return false; // cheaper → it's an anchor, not a decoy
  // Unlimited target vs a limited option priced ≥ it → clearly worse value.
  if (isUnlimited(target) && !isUnlimited(other)) return true;
  const t = perClass(target);
  const o = perClass(other);
  // Both limited: worse €/class, or fewer classes at an equal-or-higher price.
  if (t !== null && o !== null) {
    if (o > t) return true;
    if (other.price > target.price && (other.credits ?? 0) <= (target.credits ?? 0)) return true;
  }
  return false;
}

export function analyzeDecoy(
  curated: DecoyPackage[],
  recommendedId: string | null,
): DecoyAnalysis {
  const checks: DecoyCheck[] = [];

  if (curated.length === 0) {
    return { checks: [{ level: "warn", message: "Elige los paquetes a destacar." }], verdict: "incomplete" };
  }
  if (curated.length < 2) {
    return {
      checks: [{ level: "warn", message: "Elige al menos 2 (3 para el efecto completo)." }],
      verdict: "incomplete",
    };
  }

  const target = curated.find((p) => p.id === recommendedId) ?? null;
  if (!target) {
    checks.push({ level: "warn", message: "Marca tu preferido (⭐) — el que quieres empujar." });
    return { checks, verdict: "incomplete" };
  }
  checks.push({ level: "ok", message: `Objetivo: ${target.name} (tu preferido).` });

  const others = curated.filter((p) => p.id !== target.id);

  // Decoy — the option that makes the target obvious.
  const decoy = others.find((o) => isDecoyFor(target, o));
  if (decoy) {
    checks.push({
      level: "ok",
      message: `Decoy: ${decoy.name} cuesta ≥ pero ofrece menos → hace obvio a ${target.name}.`,
    });
  } else {
    checks.push({
      level: "warn",
      message:
        "Falta un decoy: una opción que cueste ≥ que tu preferido pero ofrezca menos (peor €/clase o menos clases). Sin eso el efecto no empuja.",
    });
  }

  // Anchor — a cheaper entry so the target feels accessible (target isn't cheapest).
  const anchor = others.find((o) => o.price < target.price);
  if (anchor) {
    checks.push({ level: "ok", message: `Ancla: ${anchor.name} (más barato) hace accesible a ${target.name}.` });
  } else {
    checks.push({
      level: "warn",
      message: `${target.name} es el más barato → es un ancla, no un objetivo. Considera empujar uno de valor medio.`,
    });
  }

  // The target shouldn't be the worst value (or a customer picks another).
  const t = perClass(target);
  if (t !== null) {
    const betterValue = others.find((o) => isUnlimited(o) || (perClass(o) ?? Infinity) < t);
    if (betterValue) {
      checks.push({
        level: "warn",
        message: `${betterValue.name} tiene mejor valor que tu preferido — el cliente podría elegirlo a él.`,
      });
    }
  }

  const hasWarn = checks.some((c) => c.level === "warn");
  return { checks, verdict: hasWarn ? "weak" : "good" };
}

/**
 * Deterministic fallback when the AI suggestion isn't available: target = best
 * value (unlimited, else lowest €/class), anchor = cheapest, decoy = a pricier
 * dominated option.
 */
export function suggestDecoyHeuristic(
  packages: DecoyPackage[],
  audience: "firstTimer" | "returning",
): { ids: string[]; recommendedId: string | null } {
  const pool = packages.filter((p) => p.price > 0 || isUnlimited(p));
  if (pool.length === 0) return { ids: [], recommendedId: null };

  // Target: returning → prefer unlimited; first timer → best-value multi-class pack.
  const unlimited = pool.find((p) => isUnlimited(p));
  const byValue = [...pool]
    .filter((p) => !isUnlimited(p) && (p.credits ?? 0) >= 2)
    .sort((a, b) => (perClass(a) ?? Infinity) - (perClass(b) ?? Infinity));
  const target =
    audience === "returning" ? unlimited ?? byValue[0] ?? pool[0] : byValue[0] ?? unlimited ?? pool[0];

  const anchor = [...pool]
    .filter((p) => p.id !== target.id)
    .sort((a, b) => a.price - b.price)[0];

  const decoy =
    pool.find((p) => isDecoyFor(target, p) && p.id !== anchor?.id) ??
    [...pool]
      .filter((p) => p.id !== target.id && p.id !== anchor?.id)
      .sort((a, b) => b.price - a.price)[0];

  const ids = Array.from(
    new Set([anchor?.id, target.id, decoy?.id].filter((x): x is string => !!x)),
  ).slice(0, 3);
  return { ids, recommendedId: target.id };
}
