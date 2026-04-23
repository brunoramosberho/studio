"use client";

import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingHero } from "@/components/marketing/hero";
import { MetricsTicker } from "@/components/marketing/metrics-ticker";
import { WhyMgic } from "@/components/marketing/why-mgic";
import { MemberApp } from "@/components/marketing/member-app";
import { MgicAI } from "@/components/marketing/mgic-ai";
import { DashboardSection } from "@/components/marketing/dashboard-section";
import { SocialCommunity } from "@/components/marketing/social-community";
import { MarketingPricing } from "@/components/marketing/pricing";
import { SwitchingCost } from "@/components/marketing/switching-cost";
import { MarketingFAQ } from "@/components/marketing/faq";
import { DarkCTA } from "@/components/marketing/dark-cta";
import { MarketingFooter } from "@/components/marketing/footer";

export function LandingClient() {
  return (
    <div className="min-h-dvh flex flex-col font-sans bg-background text-foreground antialiased">
      <MarketingNavbar />
      <MarketingHero />
      <MetricsTicker />
      <WhyMgic />
      <MemberApp />
      <MgicAI />
      <DashboardSection />
      <SocialCommunity />
      <MarketingPricing />
      <SwitchingCost />
      <MarketingFAQ />
      <DarkCTA />
      <MarketingFooter />
    </div>
  );
}
