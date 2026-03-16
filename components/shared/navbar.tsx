"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const publicLinks = [
  { href: "/schedule", label: "Horarios" },
  { href: "/coaches", label: "Coaches" },
  { href: "/packages", label: "Paquetes" },
];

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPortal =
    pathname.startsWith("/my") ||
    (pathname.startsWith("/coach") && pathname !== "/coaches") ||
    pathname.startsWith("/admin");
  if (isPortal) return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[#1C1917]/95 backdrop-blur-md safe-top">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-[1.5rem] font-bold tracking-tight text-white">
            Flō
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors",
                pathname === link.href
                  ? "text-[#C9A96E]"
                  : "text-white/80 hover:text-white",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {session?.user ? (
            <Link href="/my">
              <Avatar className="h-9 w-9 ring-2 ring-[#C9A96E]/30 transition-all hover:ring-[#C9A96E]/60">
                <AvatarImage src={session.user.image || undefined} />
                <AvatarFallback className="bg-[#C9A96E]/20 text-white">
                  {session.user.name?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <Button
              asChild
              size="sm"
              className="bg-[#C9A96E] text-[#1C1917] font-semibold hover:bg-[#C9A96E]/90"
            >
              <Link href="/schedule">Reservar</Link>
            </Button>
          )}

          <button
            className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/5 bg-[#1C1917] md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {publicLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-xl px-4 py-3 text-base font-medium transition-colors",
                    pathname === link.href
                      ? "bg-[#C9A96E]/15 text-[#C9A96E]"
                      : "text-white/90 hover:bg-white/5 hover:text-white",
                  )}
                >
                  {link.label}
                </Link>
              ))}
              {!session?.user && (
                <Link
                  href="/schedule"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 rounded-xl bg-[#C9A96E] px-4 py-3 text-center text-base font-semibold text-[#1C1917] transition-colors hover:bg-[#C9A96E]/90"
                >
                  Reservar
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
