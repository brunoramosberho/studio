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
import { RatingSheet } from "@/components/rating/RatingSheet";
import { WaiverGate } from "@/components/waiver/waiver-gate";
import { CookieConsent } from "@/components/shared/cookie-consent";
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

import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getServerBranding } from "@/lib/branding.server";
import { getFontPairing } from "@/lib/branding";
import { AppleSplashGenerator } from "@/components/shared/apple-splash-generator";
import type { ThemeMode } from "@/components/theme-provider";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getServerBranding();
  const fullName = `${s.studioName} Studio`;

  const h = await headers();
  const host = h.get("host") || process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  // Apple splash screens are now generated client-side via Canvas
  // (AppleSplashGenerator) — see RootLayout below. No server-side
  // startupImage entries needed.

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
        { url: "/apple-icon", sizes: "180x180", type: "image/png" },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: fullName,
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
  const locale = await getLocale();
  const messages = await getMessages();

  // Only the tenant-customizable brand vars are injected as inline style.
  // Platform neutrals (bg/fg/surface/muted/border/card) and their dark-mode
  // counterparts live in globals.css so `html.dark` can cleanly override
  // them without inline styles winning by specificity.
  const themeStyle = {
    "--color-accent": b.colorAccent,
    "--color-hero-bg": b.colorHeroBg,
    "--color-ring": b.colorAccent,
    // Role colors honour the tenant's choice in both themes.
    "--color-coach": b.colorCoach,
    "--color-admin": b.colorAdmin,
    "--font-display": fp.displayVar,
    "--font-body": fp.bodyVar,
  } as React.CSSProperties;

  const cookieStore = await cookies();
  const themePref = (cookieStore.get("studio-theme")?.value ?? "system") as ThemeMode;

  // Detect client portal for the iOS splash generator.
  const hdrs = await headers();
  const isClientPortal = (hdrs.get("x-auth-portal") ?? "client") === "client";

  return (
    <html lang={locale} className={fontVars} style={themeStyle} suppressHydrationWarning>
      <head>
        {/* No-flash theme script — resolves user preference before paint so
            the correct palette is applied on first render. Inlined to avoid
            any network round-trip. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=document.cookie.match(/(?:^|;\\s*)studio-theme=([^;]+)/);var t=(p&&p[1])||localStorage.getItem('studio-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');var m=document.querySelector('meta[name=\"theme-color\"]');if(m)m.content=d?'#0B0B0F':'#FFFFFF';}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider messages={messages}>
          <Providers initialTheme={themePref}>
            {isClientPortal && (
              <AppleSplashGenerator
                iconUrl="/api/icon?size=512"
                bgColor={b.colorHeroBg}
              />
            )}
            <InAppBrowserBanner />
            <SplashScreen />
            {children}
            <MobileNav />
            <WaiverGate />
            <RatingSheet />
            <InstallPrompt />
            <CookieConsent />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
