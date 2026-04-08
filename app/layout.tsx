import type { Metadata, Viewport } from "next";
import {
  DM_Sans,
  DM_Mono,
  Inter,
  Raleway,
  Open_Sans,
  Montserrat,
  Roboto,
  Plus_Jakarta_Sans,
  Outfit,
  Nunito_Sans,
} from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { Providers } from "./providers";
import { MobileNav } from "@/components/shared/mobile-nav";
import { InstallPrompt } from "@/components/shared/install-prompt";
import { InAppBrowserBanner } from "@/components/shared/in-app-browser-banner";
import { SplashScreen } from "@/components/shared/splash-screen";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dmsans", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dmmono", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const raleway = Raleway({ subsets: ["latin"], variable: "--font-raleway", display: "swap" });
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-opensans", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const nunitoSans = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunitosans", display: "swap" });

const fontVars = [
  dmSans, dmMono, inter, raleway, openSans, montserrat, roboto,
  jakarta, outfit, nunitoSans, GeistSans, GeistMono,
].map((f) => f.variable).join(" ");

import { headers } from "next/headers";
import { getServerBranding } from "@/lib/branding.server";
import { DEFAULTS, getFontPairing } from "@/lib/branding";
import { getTenantSlug } from "@/lib/tenant";
import { buildAppleSplashStartupImages } from "@/lib/pwa/splash-meta";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getServerBranding();
  const fullName = `${s.studioName} Studio`;

  const h = await headers();
  const host = h.get("host") || process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const slug = await getTenantSlug();
  const startupImage = slug ? buildAppleSplashStartupImages(slug) : [];

  return {
    metadataBase: new URL(baseUrl),
    title: { default: `${fullName} — ${s.tagline}`, template: `%s | ${fullName}` },
    description: `${s.slogan} ${s.metaDescription}`,
    keywords: ["pilates", "wellness", "reformer", "barre", "mat flow", "studio"],
    manifest: "/api/manifest",
    icons: {
      icon: [
        { url: "/api/icon?size=32", sizes: "32x32", type: "image/png" },
        { url: "/api/icon?size=192", sizes: "192x192", type: "image/png" },
      ],
      apple: [
        { url: slug ? `/pwa/${slug}/apple-icon-180.png` : "/apple-icon", sizes: "180x180", type: "image/png" },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: fullName,
      startupImage,
    },
    // Override apple-mobile-web-app-capable: Next.js 15+ incorrectly
    // renders "mobile-web-app-capable" which iOS Safari ignores.
    other: {
      "apple-mobile-web-app-capable": "yes",
    },
    openGraph: {
      title: `${fullName} — ${s.tagline}`,
      description: s.slogan,
      type: "website",
      images: [{ url: "/api/icon?size=512", width: 512, height: 512 }],
    },
    twitter: {
      card: "summary",
      title: `${fullName} — ${s.tagline}`,
      description: s.slogan,
      images: ["/api/icon?size=512"],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const b = await getServerBranding();
  const fp = getFontPairing(b.fontPairing);

  const themeStyle = {
    "--color-background": b.colorBg,
    "--color-foreground": b.colorFg,
    "--color-surface": b.colorSurface,
    "--color-accent": b.colorAccent,
    "--color-accent-soft": b.colorAccentSoft,
    "--color-muted": b.colorMuted,
    "--color-border": b.colorBorder,
    "--color-hero-bg": b.colorHeroBg,
    "--color-ring": b.colorAccent,
    "--color-coach": b.colorCoach,
    "--color-admin": b.colorAdmin,
    "--font-display": fp.displayVar,
    "--font-body": fp.bodyVar,
  } as React.CSSProperties;

  return (
    <html lang="es" className={fontVars} style={themeStyle}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers>
          <InAppBrowserBanner />
          <SplashScreen />
          {children}
          <MobileNav />
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
