export const STRIPE_PLANS = {
  starter: {
    name: "Mgic Studio Starter",
    priceId: process.env.STRIPE_PRICE_STARTER ?? "",
    amount: 14900, // €149/month in cents
  },
  growth: {
    name: "Mgic Studio Growth",
    priceId: process.env.STRIPE_PRICE_GROWTH ?? "",
    amount: 44900, // €449/month in cents
  },
} as const;

export type StripePlanKey = keyof typeof STRIPE_PLANS;
