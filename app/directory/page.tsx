import type { Metadata } from "next";
import { LandingClient } from "./client";

export const metadata: Metadata = {
  title: "Mgic Studio — The all-in-one platform for boutique fitness studios",
  description:
    "Replace 10 tools with one. Mgic is the modern studio management platform that handles scheduling, payments, member engagement, AI insights, and community — so you can focus on what you love.",
  keywords: [
    "studio management",
    "fitness booking",
    "pilates software",
    "boutique studio",
    "gym management",
    "booking platform",
    "member app",
  ],
  openGraph: {
    title: "Mgic Studio — The all-in-one platform for boutique fitness studios",
    description:
      "Replace 10 tools with one. Scheduling, payments, community, AI — all in Mgic.",
    url: "https://mgic.app",
    siteName: "Mgic Studio",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mgic Studio — The all-in-one platform for boutique fitness studios",
    description:
      "Replace 10 tools with one. Scheduling, payments, community, AI — all in Mgic.",
  },
};

export default function DirectoryPage() {
  return <LandingClient />;
}
