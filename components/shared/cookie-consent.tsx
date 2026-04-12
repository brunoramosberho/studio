"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const STORAGE_KEY = "cookie-consent";

export function CookieConsent() {
  const t = useTranslations("legal");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY);
    if (!accepted) setVisible(true);
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 250 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-white/95 backdrop-blur-xl md:bottom-4 md:left-auto md:right-4 md:max-w-sm md:rounded-2xl md:border md:shadow-lg"
        >
          <div className="flex items-start gap-3 p-4">
            <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                {t("cookieMessage")}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={accept}
                  className="rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
                >
                  {t("cookieAccept")}
                </button>
                <Link
                  href="/privacy"
                  className="text-xs text-muted underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  {t("cookieMoreInfo")}
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
