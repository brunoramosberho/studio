"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { FALLBACK_CURRENCY, formatMoney, type CurrencyConfig } from "@/lib/currency";

interface TenantContextValue {
  role: "CLIENT" | "COACH" | "ADMIN" | null;
  tenantId: string | null;
  tenantSlug: string | null;
  isSuperAdmin: boolean;
  hasCoachProfile: boolean;
  hasShopProducts: boolean;
  currency: CurrencyConfig;
  loading: boolean;
  refresh: () => void;
}

const TenantContext = createContext<TenantContextValue>({
  role: null,
  tenantId: null,
  tenantSlug: null,
  isSuperAdmin: false,
  hasCoachProfile: false,
  hasShopProducts: false,
  currency: FALLBACK_CURRENCY,
  loading: true,
  refresh: () => {},
});

export function useTenant() {
  return useContext(TenantContext);
}

/** Convenience hook for components that only care about currency formatting. */
export function useCurrency(): CurrencyConfig {
  return useContext(TenantContext).currency;
}

/**
 * Returns a formatter bound to the current tenant's currency config. Use this
 * from any client component that needs to render money values — it means call
 * sites become `fmt(amount)` instead of having to thread `currency.code`
 * through every `formatCurrency(amount, code)` invocation, and guarantees
 * nobody accidentally falls back to the legacy EUR default.
 *
 * Pass an `overrideCode` when the money originates from a record pinned to a
 * specific currency (e.g. a Package row) — the formatter will keep the right
 * Intl locale for that code.
 */
export function useFormatMoney(): (amount: number, overrideCode?: string | null) => string {
  const currency = useCurrency();
  return useCallback(
    (amount: number, overrideCode?: string | null) =>
      formatMoney(amount, currency, overrideCode ?? undefined),
    [currency],
  );
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [state, setState] = useState<Omit<TenantContextValue, "loading" | "refresh">>({
    role: null,
    tenantId: null,
    tenantSlug: null,
    isSuperAdmin: false,
    hasCoachProfile: false,
    hasShopProducts: false,
    currency: FALLBACK_CURRENCY,
  });
  const [loading, setLoading] = useState(true);

  const fetchMembership = useCallback(() => {
    if (status === "loading") return;
    if (!session?.user) {
      setState({
        role: null,
        tenantId: null,
        tenantSlug: null,
        isSuperAdmin: false,
        hasCoachProfile: false,
        hasShopProducts: false,
        currency: FALLBACK_CURRENCY,
      });
      setLoading(false);
      return;
    }

    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        setState({
          role: data.role ?? null,
          tenantId: data.tenantId ?? null,
          tenantSlug: data.tenantSlug ?? null,
          isSuperAdmin: data.isSuperAdmin ?? false,
          hasCoachProfile: data.hasCoachProfile ?? false,
          hasShopProducts: data.hasShopProducts ?? false,
          currency: (data.currency as CurrencyConfig | undefined) ?? FALLBACK_CURRENCY,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.user, status]);

  useEffect(() => {
    fetchMembership();
  }, [fetchMembership]);

  return (
    <TenantContext.Provider value={{ ...state, loading, refresh: fetchMembership }}>
      {children}
    </TenantContext.Provider>
  );
}
