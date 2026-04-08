import type { Metadata } from "next";
import { getServerBranding } from "@/lib/branding.server";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getServerBranding();
  const title = `Instala la App — ${b.studioName}`;
  const description = b.slogan;

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description, card: "summary_large_image" },
  };
}

export default function InstallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
