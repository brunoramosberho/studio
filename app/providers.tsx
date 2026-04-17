"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { useState } from "react";
import { BrandingProvider } from "@/components/branding-provider";
import type { StudioBranding } from "@/lib/branding";
import { TenantProvider } from "@/components/tenant-provider";
import {
  ThemeProvider,
  useTheme,
  type ThemeMode,
} from "@/components/theme-provider";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      richColors
      closeButton
      position="top-center"
      theme={resolvedTheme}
    />
  );
}

export function Providers({
  children,
  initialTheme,
  initialBranding,
}: {
  children: React.ReactNode;
  initialTheme?: ThemeMode;
  initialBranding?: StudioBranding;
}) {
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
        <ThemeProvider initialTheme={initialTheme}>
          <BrandingProvider initial={initialBranding}>
            <TenantProvider>
              {children}
              <ThemedToaster />
            </TenantProvider>
          </BrandingProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
