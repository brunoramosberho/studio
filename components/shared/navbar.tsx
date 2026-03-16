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
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl safe-top">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-2xl font-bold tracking-tight text-foreground">
            Flō
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-accent",
                pathname === link.href ? "text-accent" : "text-muted",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {session?.user ? (
            <Link href="/my">
              <Avatar className="h-9 w-9 ring-2 ring-accent/20 transition-all hover:ring-accent/50">
                <AvatarImage src={session.user.image || undefined} />
                <AvatarFallback>{session.user.name?.[0] || "U"}</AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Iniciar sesión</Link>
            </Button>
          )}

          <button
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface md:hidden"
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
            className="overflow-hidden border-t border-border/50 bg-background md:hidden"
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
                      ? "bg-accent/10 text-accent"
                      : "text-foreground hover:bg-surface",
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
