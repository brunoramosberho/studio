"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Share2, Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCoachMe } from "@/hooks/useCoachMe";
import { useTranslations } from "next-intl";

/**
 * Lets a coach copy/share a public deep link to /schedule pre-filtered to
 * their own classes (handled by ?coach=<CoachProfile.id> in schedule-client).
 * Shown on the coach dashboard so instructors can post it on social media.
 */
export function ShareScheduleCard() {
  const t = useTranslations("coach");
  const { data } = useCoachMe();
  const [copied, setCopied] = useState(false);

  const coachId = data?.coach?.id;
  if (!coachId) return null;

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/schedule?coach=${coachId}`
      : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: t("shareScheduleTitle"), url });
      } catch {
        /* user cancelled */
      }
    } else {
      copy();
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-coach/10 bg-coach/5">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-coach/10 p-2 text-coach">
              <Share2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {t("shareScheduleTitle")}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {t("shareScheduleDesc")}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted">
                  {url.replace(/^https?:\/\//, "")}
                </code>
                <button
                  onClick={copy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-coach px-3 py-2 text-xs font-semibold text-white transition hover:bg-coach/90"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? t("copied") : t("copyLink")}
                </button>
                <button
                  onClick={share}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-coach/30 p-2 text-coach transition hover:bg-coach/10"
                  title={t("share")}
                  aria-label={t("share")}
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
