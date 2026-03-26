import type { Metadata } from "next";
import { LandingClient } from "./client";

export const metadata: Metadata = {
  title: "reserva.fit — La plataforma todo-en-uno para estudios fitness",
  description:
    "Reservas, pagos, comunidad social, analytics con IA y una app white-label para tus miembros. Todo en un solo lugar.",
  keywords: [
    "reservas fitness",
    "software para estudios",
    "pilates software",
    "booking fitness",
    "gym management",
    "studio management platform",
  ],
  openGraph: {
    title: "reserva.fit — La plataforma todo-en-uno para estudios fitness",
    description:
      "Reservas, pagos, comunidad social, analytics con IA y una app white-label para tus miembros.",
    type: "website",
    url: "https://reserva.fit",
  },
  twitter: {
    card: "summary_large_image",
    title: "reserva.fit — La plataforma todo-en-uno para estudios fitness",
    description:
      "Reservas, pagos, comunidad social, analytics con IA y una app white-label para tus miembros.",
  },
};

export default function DirectoryPage() {
  return <LandingClient />;
}
