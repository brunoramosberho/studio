"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Compact share button for a coach's class page. Copies / shares the public
 * /class/<id> booking link so the instructor can post it and people can book
 * straight into this class. Mirrors ShareScheduleCard's share/copy logic:
 * native share sheet on mobile, clipboard copy (with a "copied" tick) on
 * desktop.
 */
export function ShareClassButton({
  classId,
  name,
}: {
  classId: string;
  name?: string;
}) {
  const t = useTranslations("coach");
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/class/${classId}`
      : "";

  async function handleShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: name ? t("shareClassPrompt", { name }) : t("share"),
          url,
        });
        return;
      } catch {
        /* user cancelled or unsupported — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-coach/30 px-3 py-2 text-sm font-semibold text-coach transition hover:bg-coach/10"
    >
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {copied ? t("copied") : t("share")}
    </button>
  );
}
