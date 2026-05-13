export type StripePlanKey = "starter" | "growth" | "scale";

export type SaasPlanEnvFallback = {
  priceId: string;
  name: string;
  amountCents: number;
};

/** Legacy env-based fallback when no matching `SaasPlan` row exists. */
export function getSaasPlanEnvFallback(
  planKey: string,
  sandbox = false,
): SaasPlanEnvFallback | null {
  switch (planKey.toLowerCase()) {
    case "starter": {
      const priceId = sandbox
        ? process.env.STRIPE_PRICE_STARTER_TEST?.trim() ||
          process.env.STRIPE_PRICE_STARTER?.trim() ||
          ""
        : process.env.STRIPE_PRICE_STARTER?.trim() ?? "";
      return {
        priceId,
        name: "Mgic Studio Starter",
        amountCents: 29900,
      };
    }
    case "growth": {
      const priceId = sandbox
        ? process.env.STRIPE_PRICE_GROWTH_TEST?.trim() ||
          process.env.STRIPE_PRICE_GROWTH?.trim() ||
          ""
        : process.env.STRIPE_PRICE_GROWTH?.trim() ?? "";
      return {
        priceId,
        name: "Mgic Studio Growth",
        amountCents: 44900,
      };
    }
    case "scale": {
      const priceId = sandbox
        ? process.env.STRIPE_PRICE_SCALE_TEST?.trim() ||
          process.env.STRIPE_PRICE_SCALE?.trim() ||
          ""
        : process.env.STRIPE_PRICE_SCALE?.trim() ?? "";
      return {
        priceId,
        name: "Mgic Studio Scale",
        amountCents: 69900,
      };
    }
    default:
      return null;
  }
}

/**
 * @deprecated Prefer `SaasPlan` in the database + `resolveSaasStripePriceId`.
 * Kept for callers that still expect a static map.
 */
export const STRIPE_PLANS: Record<
  StripePlanKey,
  { name: string; priceId: string; amount: number }
> = {
  starter: {
    name: "Mgic Studio Starter",
    priceId: process.env.STRIPE_PRICE_STARTER ?? "",
    amount: 29900,
  },
  growth: {
    name: "Mgic Studio Growth",
    priceId: process.env.STRIPE_PRICE_GROWTH ?? "",
    amount: 44900,
  },
  scale: {
    name: "Mgic Studio Scale",
    priceId: process.env.STRIPE_PRICE_SCALE ?? "",
    amount: 69900,
  },
};
