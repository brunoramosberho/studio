import type { Metadata, Viewport } from "next";
import { Playfair_Display, DM_Sans, DM_Mono } from "next/font/google";
import { Providers } from "./providers";
import { MobileNav } from "@/components/shared/mobile-nav";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Flō Studio — Pilates & Wellness",
    template: "%s | Flō Studio",
  },
  description:
    "Muévete. Respira. Floréce. Clases de Reformer Pilates, Mat Flow y Barre Fusion en un espacio diseñado para ti.",
  keywords: ["pilates", "wellness", "reformer", "barre", "mat flow", "studio", "México"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Flō Studio",
  },
  openGraph: {
    title: "Flō Studio — Pilates & Wellness",
    description: "Muévete. Respira. Floréce.",
    type: "website",
  },
};

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
    <html
      lang="es"
      className={`${playfair.variable} ${dmSans.variable} ${dmMono.variable}`}
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers>
          {children}
          <MobileNav />
        </Providers>
      </body>
    </html>
  );
}
