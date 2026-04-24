import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LandingClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  const title = t("title");
  const description = t("description");
  const ogDescription = t("ogDescription");
  const keywords = t.raw("keywords") as string[];

  return {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description: ogDescription,
      url: "https://mgic.app",
      siteName: "Mgic Studio",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: ogDescription,
    },
  };
}

export default function DirectoryPage() {
  return <LandingClient />;
}
