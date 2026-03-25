"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { BrandingProvider } from "@/components/branding-provider";
import { TenantProvider } from "@/components/tenant-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <BrandingProvider>
          <TenantProvider>{children}</TenantProvider>
        </BrandingProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
