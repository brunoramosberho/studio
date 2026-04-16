import type { Metadata } from "next";
import { getServerBranding } from "@/lib/branding.server";

/**
 * Minimal layout for embed widgets. No navbar, footer, mobile nav or any
 * overlay. Pages rendered under /embed are meant to be loaded inside
 * third-party iframes (e.g. a tenant's WordPress site), so we opt out of
 * search indexing and strip every chrome element.
 *
 * Overlay components mounted in the root layout (MobileNav, InstallPrompt,
 * etc.) each exclude `/embed/*` via their own pathname filters.
 */
export async function generateMetadata(): Promise<Metadata> {
  const b = await getServerBranding();
  return {
    title: `${b.studioName} — Schedule`,
    robots: { index: false, follow: false },
  };
}

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="embed-root min-h-dvh bg-background">{children}</div>;
}
