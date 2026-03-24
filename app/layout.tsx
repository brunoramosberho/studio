import type { Metadata, Viewport } from "next";
import {
  Playfair_Display,
  DM_Sans,
  DM_Mono,
  Cormorant_Garamond,
  Lato,
  Libre_Baskerville,
  Source_Sans_3,
  Josefin_Sans,
  Work_Sans,
  Crimson_Text,
  Inter,
  Raleway,
  Open_Sans,
  Lora,
  Nunito,
  Montserrat,
  Roboto,
} from "next/font/google";
import { Providers } from "./providers";
import { MobileNav } from "@/components/shared/mobile-nav";
import { InstallPrompt } from "@/components/shared/install-prompt";
import "./globals.css";

const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dmsans", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-cormorant", display: "swap" });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-lato", display: "swap" });
const libre = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-libre", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source", display: "swap" });
const josefin = Josefin_Sans({ subsets: ["latin"], variable: "--font-josefin", display: "swap" });
const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work", display: "swap" });
const crimson = Crimson_Text({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-crimson", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const raleway = Raleway({ subsets: ["latin"], variable: "--font-raleway", display: "swap" });
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-opensans", display: "swap" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto", display: "swap" });

const fontVars = [
  playfair, dmSans, dmMono, cormorant, lato, libre, sourceSans,
  josefin, workSans, crimson, inter, raleway, openSans, lora,
  nunito, montserrat, roboto,
].map((f) => f.variable).join(" ");

import { prisma } from "@/lib/db";
import { DEFAULTS } from "@/lib/branding";

async function getSettings() {
  try {
    return (await prisma.studioSettings.findUnique({ where: { id: "singleton" } })) ?? DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const fullName = `${s.studioName} Studio`;
  return {
    title: { default: `${fullName} — ${s.tagline}`, template: `%s | ${fullName}` },
    description: `${s.slogan} ${s.metaDescription}`,
    keywords: ["pilates", "wellness", "reformer", "barre", "mat flow", "studio"],
    manifest: "/api/manifest",
    icons: {
      icon: "/api/icon?size=192",
      apple: "/api/icon?size=180",
    },
    appleWebApp: { capable: true, statusBarStyle: "default", title: fullName },
    openGraph: { title: `${fullName} — ${s.tagline}`, description: s.slogan, type: "website" },
  };
}

export const viewport: Viewport = {
  themeColor: "#FAF9F6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={fontVars}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers>
          {children}
          <MobileNav />
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
