import type { Metadata } from "next";
import { LandingClient } from "./client";

export const metadata: Metadata = {
  title: "Mgic Studio — La plataforma todo-en-uno para studios boutique de fitness",
  description:
    "Reemplaza 10 herramientas con una. Mgic es la plataforma moderna de gestión para studios: reservas, pagos, engagement, insights con IA y comunidad — para que te enfoques en lo que amas.",
  keywords: [
    "gestión de studio",
    "reservas fitness",
    "software pilates",
    "studio boutique",
    "gestión de gimnasio",
    "plataforma de reservas",
    "app de miembros",
  ],
  openGraph: {
    title: "Mgic Studio — La plataforma todo-en-uno para studios boutique de fitness",
    description:
      "Reemplaza 10 herramientas con una. Reservas, pagos, comunidad, IA — todo en Mgic.",
    url: "https://mgic.app",
    siteName: "Mgic Studio",
    type: "website",
    locale: "es_ES",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mgic Studio — La plataforma todo-en-uno para studios boutique de fitness",
    description:
      "Reemplaza 10 herramientas con una. Reservas, pagos, comunidad, IA — todo en Mgic.",
  },
};

export default function DirectoryPage() {
  return <LandingClient />;
}
