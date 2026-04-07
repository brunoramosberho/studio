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
import { useBranding } from "@/components/branding-provider";

const publicLinks = [
  { href: "/schedule", label: "Horarios" },
  { href: "/coaches", label: "Coaches" },
  { href: "/packages", label: "Paquetes" },
];

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { studioName, logoUrl, landingUrl } = useBranding();
  const homeHref = landingUrl || "/";

  const isPortal =
    pathname.startsWith("/my") ||
    (pathname.startsWith("/coach") && pathname !== "/coaches") ||
    pathname.startsWith("/admin");
  if (isPortal) return null;

  const hideForLoggedIn =
    pathname === "/schedule" ||
    pathname === "/coaches" ||
    pathname.startsWith("/class/") ||
    pathname.startsWith("/book/");
  if (session?.user && hideForLoggedIn) return null;

  return (
    <header className="sticky top-0 z-40 w-full bg-white safe-top">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Mobile: hamburger + logo */}
        <div className="flex items-center gap-3">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {landingUrl ? (
            <a href={landingUrl} className="flex items-center">
              {logoUrl ? (
                <img src={logoUrl} alt={studioName} className="h-6 max-w-[140px] object-contain" />
              ) : (
                <span className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {studioName}
                </span>
              )}
            </a>
          ) : (
            <Link href="/" className="flex items-center">
              {logoUrl ? (
                <img src={logoUrl} alt={studioName} className="h-6 max-w-[140px] object-contain" />
              ) : (
                <span className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {studioName}
                </span>
              )}
            </Link>
          )}
        </div>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-8 lg:flex">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-[13px] font-medium uppercase tracking-wider transition-colors hover:text-foreground",
                pathname === link.href ? "text-foreground" : "text-muted",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {session?.user ? (
            <Link href="/my">
              <Avatar className="h-8 w-8">
                <AvatarImage src={session.user.image || undefined} />
                <AvatarFallback className="bg-surface text-xs text-muted">
                  {session.user.name?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-[13px] font-medium text-muted transition-colors hover:text-foreground"
            >
              Cuenta
            </Link>
          )}
          <Button asChild size="sm" className="h-9 rounded-lg bg-foreground px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-foreground/90">
            <Link href="/schedule">Reservar</Link>
          </Button>
        </div>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" as const }}
            className="overflow-hidden border-t border-border/50 bg-white lg:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-3">
              {publicLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    pathname === link.href
                      ? "text-foreground"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
