"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface TenantContextValue {
  role: "CLIENT" | "COACH" | "ADMIN" | null;
  tenantId: string | null;
  tenantSlug: string | null;
  isSuperAdmin: boolean;
  loading: boolean;
  refresh: () => void;
}

const TenantContext = createContext<TenantContextValue>({
  role: null,
  tenantId: null,
  tenantSlug: null,
  isSuperAdmin: false,
  loading: true,
  refresh: () => {},
});

export function useTenant() {
  return useContext(TenantContext);
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [state, setState] = useState<Omit<TenantContextValue, "loading" | "refresh">>({
    role: null,
    tenantId: null,
    tenantSlug: null,
    isSuperAdmin: false,
  });
  const [loading, setLoading] = useState(true);

  const fetchMembership = useCallback(() => {
    if (status === "loading") return;
    if (!session?.user) {
      setState({ role: null, tenantId: null, tenantSlug: null, isSuperAdmin: false });
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
