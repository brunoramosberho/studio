"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { AnimatedFileText, type FileTextIconHandle } from "@/components/icons/animated-file-text";

const DISMISSED_KEY = "waiver-gate-dismissed";
const SKIP_PREFIXES = ["/login", "/admin", "/coach", "/dev", "/waiver", "/super-admin", "/directory", "/install"];

export function WaiverGate() {
  const pathname = usePathname();
  const { data: session, status: authStatus } = useSession();
  const t = useTranslations("booking");
  const [show, setShow] = useState(false);
  const iconRef = useRef<FileTextIconHandle>(null);

  const shouldSkip = SKIP_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (authStatus !== "authenticated" || !session?.user?.id || shouldSkip) return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    fetch("/api/waiver/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const isPending = data && (data.status === "pending" || data.status === "needs_resign");
        const triggerEnabled = data?.triggers?.onFirstOpen !== false;
        if (isPending && triggerEnabled && data?.hasUpcomingBooking) {
          setShow(true);
        }
      })
      .catch(() => {});
  }, [authStatus, session?.user?.id, shouldSkip]);

  useEffect(() => {
    if (!show) return;
    const timeout = setTimeout(() => iconRef.current?.startAnimation(), 400);
    const interval = setInterval(() => iconRef.current?.startAnimation(), 3000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [show]);

  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed inset-x-0 bottom-20 z-50 mx-auto w-[calc(100%-2rem)] max-w-md md:bottom-6"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-white p-4 shadow-lg shadow-black/5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AnimatedFileText ref={iconRef} size={18} className="p-0" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-stone-800">
                {t("waiverPending")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                {t("waiverGateDesc")}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <Link
                  href="/waiver/sign"
                  onClick={handleDismiss}
                  className="flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white transition-opacity active:opacity-80"
                >
                  {t("signNow")}
                  <ArrowRight size={13} />
                </Link>
                <button
                  onClick={handleDismiss}
                  className="rounded-full px-3 py-1.5 text-xs text-stone-400 transition-colors hover:text-stone-600"
                >
                  {t("later")}
                </button>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="shrink-0 rounded-full p-1 text-stone-300 transition-colors hover:bg-stone-100 hover:text-stone-500"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
