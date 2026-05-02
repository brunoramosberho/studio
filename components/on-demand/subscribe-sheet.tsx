"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SubscribeSheet } from "@/components/checkout/SubscribeSheet";

interface SubscribeOnDemandSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface CatalogConfig {
  config: {
    enabled: boolean;
    description: string | null;
    package: {
      id: string;
      name: string;
      price: number;
      currency: string;
      recurringInterval: string | null;
    } | null;
  } | null;
}

/**
 * Thin wrapper around `SubscribeSheet` that resolves the on-demand SKU from
 * the public catalog endpoint and forwards the rest of the flow unchanged.
 *
 * This avoids duplicating the saved-card UI, payment-intent confirmation
 * choreography, and 3DS handling that already exists in `SubscribeSheet`.
 * The resulting sheet:
 *   - shows the member's saved cards (one-tap subscribe with the default card)
 *   - falls back to a fresh card form if none are on file
 *   - posts to /api/stripe/member-subscription, which now accepts both
 *     SUBSCRIPTION and ON_DEMAND_SUBSCRIPTION packages.
 */
export function SubscribeOnDemandSheet({
  open,
  onOpenChange,
}: SubscribeOnDemandSheetProps) {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["on-demand-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/on-demand/catalog");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as CatalogConfig;
    },
    enabled: open,
  });

  const pkg = data?.config?.package ?? null;
  if (!open || !pkg) return null;

  return (
    <SubscribeSheet
      open={open}
      onClose={() => onOpenChange(false)}
      pkg={{
        id: pkg.id,
        name: pkg.name,
        price: pkg.price,
        currency: pkg.currency,
        recurringInterval: pkg.recurringInterval,
        // On-demand is always unlimited access — `null` triggers the
        // "Unlimited classes" copy in SubscribeSheet.
        credits: null,
      }}
      onSuccess={() => {
        qc.invalidateQueries({ queryKey: ["on-demand-catalog"] });
        qc.invalidateQueries({ queryKey: ["on-demand-subscription"] });
        qc.invalidateQueries({ queryKey: ["on-demand-video"] });
      }}
    />
  );
}
