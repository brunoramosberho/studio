import type { Metadata } from "next";
import { getServerBranding } from "@/lib/branding.server";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getServerBranding();
  return {
    title: `Instalar ${b.studioName}`,
  };
}

export default function InstallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
