"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Globe, Check, Loader2 } from "lucide-react";

interface LanguageSelectorProps {
  /** Current locale ("en" | "es") */
  currentLocale: string;
  /** "tenant" = admin updating studio default locale, "user" = user override */
  mode: "tenant" | "user";
  /** Callback after saving */
  onSaved?: () => void;
}

export function LanguageSelector({ currentLocale, mode, onSaved }: LanguageSelectorProps) {
  const t = useTranslations("settings");
  const [value, setValue] = useState(currentLocale);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  async function handleChange(newLocale: string) {
    if (newLocale === value) return;
    setValue(newLocale);
    setSaving(true);
    setSaved(false);

    try {
      if (mode === "tenant") {
        await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: newLocale }),
        });
      } else {
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: newLocale }),
        });
      }

      // Set the cookie for immediate locale switch
      document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();

      // Refresh the page to apply new locale
      router.refresh();
    } catch {
      // Revert on error
      setValue(currentLocale);
    }
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted" />
        <div>
          <p className="text-sm font-medium">{t("language")}</p>
          <p className="text-xs text-muted">{t("languageDescription")}</p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          disabled={saving}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium outline-none"
        >
          <option value="es">{t("spanish")}</option>
          <option value="en">{t("english")}</option>
        </select>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
        {saved && <Check className="h-4 w-4 text-green-500" />}
      </div>
    </div>
  );
}
