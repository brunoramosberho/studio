"use client";

import { LandingNav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Studios } from "@/components/landing/studios";
import { Features } from "@/components/landing/features";
import { Showcase } from "@/components/landing/showcase";
import { AIChat } from "@/components/landing/ai-chat";
import { Comparison } from "@/components/landing/comparison";
import { Pricing } from "@/components/landing/pricing";
import { FAQ } from "@/components/landing/faq";
import { FinalCTA, Footer } from "@/components/landing/cta-footer";

export function LandingClient() {
  return (
    <div className="min-h-dvh overflow-x-hidden scroll-auto bg-gray-50 text-gray-900 antialiased selection:bg-orange-100 selection:text-orange-600">
      <LandingNav />
      <Hero />
      <Studios />
      <Features />
      <Showcase />
      <AIChat />
      <Comparison />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
