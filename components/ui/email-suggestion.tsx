"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { suggestEmailCorrection } from "@/lib/email-typo";
import { cn } from "@/lib/utils";

/**
 * Inline "did you mean …?" hint shown under an email field when the typed
 * address looks like a typo (e.g. `.con` → `.com`). Tapping it applies the fix.
 * Renders nothing when the address looks fine — never blocks submission.
 */
export function EmailSuggestion({
  email,
  onAccept,
  className,
}: {
  email: string;
  onAccept: (corrected: string) => void;
  className?: string;
}) {
  const t = useTranslations("common");
  const suggestion = useMemo(() => suggestEmailCorrection(email), [email]);
  if (!suggestion) return null;

  return (
    <button
      type="button"
      onClick={() => onAccept(suggestion)}
      className={cn(
        "mt-1.5 text-left text-xs text-amber-600 transition-colors hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300",
        className,
      )}
    >
      {t("emailDidYouMean", { suggestion })}
    </button>
  );
}
