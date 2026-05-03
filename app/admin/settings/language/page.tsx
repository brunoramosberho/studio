"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe, Loader2 } from "lucide-react";
import { LanguageSelector } from "@/components/shared/language-selector";
import { SectionTabs } from "@/components/admin/section-tabs";
import { STUDIO_CONFIG_TABS } from "@/components/admin/section-tab-configs";

export default function LanguageSettingsPage() {
  const t = useTranslations("settings");
  const ta = useTranslations("admin");
  const [tenantLocale, setTenantLocale] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/tenant-locale")
      .then((r) => r.ok ? r.json() : { locale: "es" })
      .then((d) => setTenantLocale(d.locale))
      .catch(() => setTenantLocale("es"));
  }, []);

  if (!tenantLocale) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <SectionTabs tabs={STUDIO_CONFIG_TABS} ariaLabel="Studio configuration sections" />
      <div>
        <h1 className="font-display text-2xl font-bold">{t("language")}</h1>
        <p className="mt-1 text-sm text-muted">{t("languageDescription")}</p>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-6">
        <LanguageSelector currentLocale={tenantLocale} mode="tenant" />
      </div>
    </div>
  );
}
