"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { FileText, ChevronRight, X } from "lucide-react";
import { useBranding } from "@/components/branding-provider";

const DISMISSED_KEY = "waiver-gate-dismissed";
const SKIP_PREFIXES = ["/login", "/admin", "/coach", "/dev", "/waiver", "/super-admin", "/directory", "/install"];

export function WaiverGate() {
  const pathname = usePathname();
  const { data: session, status: authStatus } = useSession();
  const { studioName } = useBranding();
  const [show, setShow] = useState(false);

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

  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-stone-50 px-6 text-center"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <button
            onClick={handleDismiss}
            className="absolute right-4 top-4 rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            style={{ marginTop: "env(safe-area-inset-top)" }}
          >
            <X size={20} />
          </button>

          <motion.div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            <FileText className="h-8 w-8 text-amber-600" />
          </motion.div>

          <motion.h1
            className="mb-3 text-xl font-semibold text-stone-800"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            Firma requerida
          </motion.h1>

          <motion.p
            className="mb-10 max-w-xs text-sm leading-relaxed text-stone-500"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            Para seguir usando {studioName}, necesitas firmar el acuerdo de
            responsabilidad. Solo lo harás una vez.
          </motion.p>

          <motion.div
            className="flex w-full max-w-xs flex-col gap-3"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Link
              href="/waiver/sign"
              onClick={() => sessionStorage.setItem(DISMISSED_KEY, "1")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1C2340] py-4 text-base font-medium text-white active:opacity-90"
            >
              Leer y firmar
              <ChevronRight size={18} />
            </Link>

            <button
              onClick={handleDismiss}
              className="py-2 text-sm text-stone-400 transition-colors hover:text-stone-600"
            >
              Después
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
