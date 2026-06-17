"use client";

import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingHero } from "@/components/marketing/hero";
import { MetricsTicker } from "@/components/marketing/metrics-ticker";
import { Pillars } from "@/components/marketing/pillars";
import { MarketingSupport } from "@/components/marketing/support";
import { MarketingPricing } from "@/components/marketing/pricing";
import { MarketingContact } from "@/components/marketing/contact";
import { MarketingFooter } from "@/components/marketing/footer";

export function LandingClient() {
  return (
    <div className="min-h-dvh flex flex-col font-sans bg-background text-foreground antialiased">
      <MarketingNavbar />
      <MarketingHero />
      <MetricsTicker />
      <Pillars />
      <MarketingSupport />
      <MarketingPricing />
      <MarketingContact />
      <MarketingFooter />
    </div>
  );
}
